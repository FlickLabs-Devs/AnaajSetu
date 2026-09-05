-- AaharSetu Phase 6: Atomic Reservations
-- Fixes race conditions and prevents overbooking

-- RPC to accept a request and decrement listing quantity atomically
CREATE OR REPLACE FUNCTION public.accept_reservation(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request RECORD;
    v_listing RECORD;
    v_order_id UUID;
BEGIN
    -- 1. Lock the request row
    SELECT * INTO v_request 
    FROM public.requests 
    WHERE id = p_request_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already processed';
    END IF;

    -- 2. Lock the listing row
    SELECT * INTO v_listing 
    FROM public.listings 
    WHERE id = v_request.listing_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing not found';
    END IF;

    -- 3. Check for sufficient quantity
    IF v_listing.quantity < v_request.requested_quantity THEN
        RAISE EXCEPTION 'Insufficient quantity available';
    END IF;

    -- 4. Decrement listing quantity
    UPDATE public.listings 
    SET quantity = quantity - v_request.requested_quantity
    WHERE id = v_listing.id;

    -- 5. Update request status
    UPDATE public.requests 
    SET status = 'accepted' 
    WHERE id = p_request_id;

    -- 6. Insert order record
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

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;
