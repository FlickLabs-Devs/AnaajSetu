-- AnaajSetu Cart Farmer Approval Fix
-- This migration corrects the cart checkout flow to create pending requests 
-- instead of automatically creating accepted orders and decrementing inventory.

-- 1. Add order_group_id to requests so pending cart items can be grouped
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='requests' AND column_name='order_group_id'
    ) THEN
        ALTER TABLE public.requests 
        ADD COLUMN order_group_id UUID REFERENCES public.order_groups(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_requests_order_group_id ON public.requests(order_group_id);

-- 2. Rewrite checkout_cart to ONLY create pending requests
CREATE OR REPLACE FUNCTION public.checkout_cart(p_buyer_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cart RECORD;
    v_item RECORD;
    v_listing RECORD;
    v_group_id UUID;
    v_request_id UUID;
    v_group_total NUMERIC := 0;
    v_item_subtotal NUMERIC := 0;
BEGIN
    -- 1. Get and lock the cart
    SELECT * INTO v_cart FROM public.buyer_carts WHERE buyer_id = p_buyer_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found';
    END IF;

    -- 2. Create the order group first
    INSERT INTO public.order_groups (buyer_id, status, total_amount)
    VALUES (p_buyer_id, 'processing', 0)
    RETURNING id INTO v_group_id;

    -- 3. Loop through cart items with locking
    FOR v_item IN (SELECT * FROM public.cart_items WHERE cart_id = v_cart.id ORDER BY created_at FOR UPDATE) LOOP
        -- Lock listing
        SELECT * INTO v_listing FROM public.listings WHERE id = v_item.listing_id FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Listing % no longer exists', v_item.produce_name;
        END IF;

        IF v_listing.status != 'active' THEN
            RAISE EXCEPTION 'Listing % is not active', v_listing.produce_name;
        END IF;

        IF v_listing.quantity < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for %', v_listing.produce_name;
        END IF;
        
        IF v_item.quantity < v_listing.minimum_order_quantity THEN
            RAISE EXCEPTION 'Quantity for % is below minimum order requirement', v_listing.produce_name;
        END IF;

        -- Calculate total using CURRENT price
        v_item_subtotal := v_item.quantity * v_listing.price_per_unit;
        v_group_total := v_group_total + v_item_subtotal;

        -- Create PENDING request matching standard architecture
        INSERT INTO public.requests (
            listing_id, buyer_id, farmer_id, requested_quantity, unit, offered_price_per_unit, status, message, order_group_id
        ) VALUES (
            v_listing.id, p_buyer_id, v_listing.farmer_id, v_item.quantity, v_listing.unit, v_listing.price_per_unit, 'pending', 'Cart Purchase', v_group_id
        ) RETURNING id INTO v_request_id;

        -- CRITICAL FIX: Do NOT create an order here.
        -- CRITICAL FIX: Do NOT decrement listing quantity here.
    END LOOP;

    -- If no items were processed, fail
    IF v_group_total = 0 THEN
        RAISE EXCEPTION 'Cart is empty or all items were invalid';
    END IF;

    -- 4. Update the order group total
    UPDATE public.order_groups SET total_amount = v_group_total WHERE id = v_group_id;

    -- 5. Clear the cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart.id;

    RETURN jsonb_build_object('success', true, 'order_group_id', v_group_id);
END;
$$;

-- 3. Rewrite accept_reservation to pass order_group_id
CREATE OR REPLACE FUNCTION public.accept_reservation(p_request_id uuid, p_farmer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_listing RECORD;
    v_order_id UUID;
BEGIN
    -- 1. Validate that the caller provided an ID
    IF p_farmer_id IS NULL OR trim(p_farmer_id) = '' THEN
        RAISE EXCEPTION 'Unauthorized: Farmer ID is required';
    END IF;

    -- 2. Lock the request row
    SELECT * INTO v_request
    FROM public.requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    -- Verify ownership securely
    IF v_request.farmer_id != p_farmer_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this request.';
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already processed';
    END IF;

    -- 3. Lock the listing row
    SELECT * INTO v_listing
    FROM public.listings
    WHERE id = v_request.listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing not found';
    END IF;

    -- Verify ownership recursively just to be safe
    IF v_listing.farmer_id != p_farmer_id THEN
        RAISE EXCEPTION 'Unauthorized: You do not own this listing.';
    END IF;

    IF v_listing.status != 'active' THEN
        RAISE EXCEPTION 'Listing is not active';
    END IF;

    -- 4. Check for sufficient quantity
    IF v_request.requested_quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid requested quantity';
    END IF;

    IF v_listing.quantity < v_request.requested_quantity THEN
        RAISE EXCEPTION 'Insufficient quantity available';
    END IF;

    -- Prevent duplicate order creation for this request
    IF EXISTS (SELECT 1 FROM public.orders WHERE request_id = p_request_id) THEN
        RAISE EXCEPTION 'Order already exists for this request';
    END IF;

    -- 5. Decrement listing quantity
    UPDATE public.listings
    SET 
        quantity = quantity - v_request.requested_quantity,
        status = CASE 
            WHEN (quantity - v_request.requested_quantity) <= 0 THEN 'sold_out'
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = v_listing.id;

    -- 6. Update request status
    UPDATE public.requests
    SET 
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 7. Insert order record (carrying over order_group_id if it exists)
    INSERT INTO public.orders (
        request_id,
        listing_id,
        buyer_id,
        farmer_id,
        produce_name,
        quantity,
        unit,
        price_per_unit,
        total_amount,
        status,
        order_group_id
    ) VALUES (
        p_request_id,
        v_request.listing_id,
        v_request.buyer_id,
        v_request.farmer_id,
        v_listing.produce_name,
        v_request.requested_quantity,
        v_request.unit,
        v_request.offered_price_per_unit,
        (v_request.requested_quantity * v_request.offered_price_per_unit),
        'accepted',
        v_request.order_group_id
    ) RETURNING id INTO v_order_id;

    -- Return JSON payload expected by frontend { "success": true, "order_id": <uuid> }
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;






