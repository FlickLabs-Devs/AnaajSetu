-- AaharSetu Repair Migration: Fix Accept Reservation RPC
-- Fixes the missing function in schema cache and allows safe caller verification
-- because the app connects to Supabase as 'anon' without a JWT for auth.uid().

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

    -- 7. Insert order record
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
        status
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
        'accepted'
    ) RETURNING id INTO v_order_id;

    -- Return JSON payload expected by frontend { "success": true, "order_id": <uuid> }
    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;
