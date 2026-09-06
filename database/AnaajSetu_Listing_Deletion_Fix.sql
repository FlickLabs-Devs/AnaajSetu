-- AnaajSetu - Fix Farmer Listing Deletion RPC (400 Bad Request Fix)

-- 1. Explicitly drop any potentially conflicting or overloaded signatures
DROP FUNCTION IF EXISTS public.delete_farmer_listing(uuid, text);
DROP FUNCTION IF EXISTS public.delete_farmer_listing(text, text);
DROP FUNCTION IF EXISTS public.delete_farmer_listing(uuid);
DROP FUNCTION IF EXISTS public.delete_farmer_listing();

-- 2. Create the exact matching RPC function with safe text casting
CREATE OR REPLACE FUNCTION public.delete_farmer_listing(p_listing_id UUID, p_farmer_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_req_count INT;
    v_active_neg_count INT;
    v_active_ord_count INT;
    v_hist_req_count INT;
    v_hist_neg_count INT;
    v_hist_ord_count INT;
    v_listing_exists BOOLEAN;
BEGIN
    -- Verify ownership
    SELECT EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = p_listing_id 
          AND farmer_id = p_farmer_id 
          AND deleted_at IS NULL
    ) INTO v_listing_exists;

    IF NOT v_listing_exists THEN
        RAISE EXCEPTION 'LISTING_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    -- Check for active blocking transactions
    -- ONLY pending/accepted requests block
    SELECT COUNT(*) INTO v_active_req_count 
    FROM public.requests 
    WHERE listing_id = p_listing_id AND status IN ('pending', 'accepted');
    
    -- ONLY active negotiations block. (Accepted negotiations turn into orders, so we rely on order status instead of permanently blocking the listing).
    SELECT COUNT(*) INTO v_active_neg_count 
    FROM public.negotiations 
    WHERE listing_id = p_listing_id AND status = 'active';
    
    -- ONLY accepted/processing orders block
    SELECT COUNT(*) INTO v_active_ord_count 
    FROM public.orders 
    WHERE listing_id = p_listing_id AND status IN ('accepted', 'processing');

    -- If any active transactions exist, safely block deletion
    IF v_active_req_count > 0 OR v_active_neg_count > 0 OR v_active_ord_count > 0 THEN
        RAISE EXCEPTION 'HAS_ACTIVE_TRANSACTIONS';
    END IF;

    -- Cleanup safe non-historical dependencies (cart_items)
    DELETE FROM public.cart_items WHERE listing_id = p_listing_id;

    -- Check for historical transactions
    SELECT COUNT(*) INTO v_hist_req_count FROM public.requests WHERE listing_id = p_listing_id;
    SELECT COUNT(*) INTO v_hist_neg_count FROM public.negotiations WHERE listing_id = p_listing_id;
    SELECT COUNT(*) INTO v_hist_ord_count FROM public.orders WHERE listing_id = p_listing_id;

    IF v_hist_req_count > 0 OR v_hist_neg_count > 0 OR v_hist_ord_count > 0 THEN
        -- OPTION B: Historical records exist, physical delete would violate FK
        -- Perform Soft Delete
        UPDATE public.listings SET deleted_at = NOW(), updated_at = NOW() WHERE id = p_listing_id;
        RETURN 'SOFT_DELETED';
    ELSE
        -- OPTION A: No historical transactions, physical delete is safe
        DELETE FROM public.listing_images WHERE listing_id = p_listing_id;
        DELETE FROM public.listings WHERE id = p_listing_id;
        RETURN 'HARD_DELETED';
    END IF;
END;
$$;
