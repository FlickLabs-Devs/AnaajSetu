-- AnaajSetu - Fix Farmer Listing Deletion Flow
-- Adds soft delete support and atomic RPC for safe listing deletion

-- 1. Add deleted_at column for soft delete mechanism
ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_listings_deleted_at ON public.listings(deleted_at);

-- 2. Create the secure RPC function
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
    -- 1. Verify ownership (matches farmer_id to existing records)
    SELECT EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = p_listing_id AND farmer_id = p_farmer_id
    ) INTO v_listing_exists;

    IF NOT v_listing_exists THEN
        RAISE EXCEPTION 'LISTING_NOT_FOUND_OR_UNAUTHORIZED';
    END IF;

    -- 2. Check for active blocking transactions
    SELECT COUNT(*) INTO v_active_req_count 
    FROM public.requests 
    WHERE listing_id = p_listing_id AND status IN ('pending', 'accepted');
    
    SELECT COUNT(*) INTO v_active_neg_count 
    FROM public.negotiations 
    WHERE listing_id = p_listing_id AND status IN ('active', 'accepted');
    
    SELECT COUNT(*) INTO v_active_ord_count 
    FROM public.orders 
    WHERE listing_id = p_listing_id AND status IN ('accepted', 'processing');

    -- If any active transactions exist, safely block deletion
    IF v_active_req_count > 0 OR v_active_neg_count > 0 OR v_active_ord_count > 0 THEN
        RAISE EXCEPTION 'HAS_ACTIVE_TRANSACTIONS';
    END IF;

    -- 3. Cleanup safe non-historical dependencies (cart_items)
    DELETE FROM public.cart_items WHERE listing_id = p_listing_id;

    -- 4. Check for historical transactions
    SELECT COUNT(*) INTO v_hist_req_count FROM public.requests WHERE listing_id = p_listing_id;
    SELECT COUNT(*) INTO v_hist_neg_count FROM public.negotiations WHERE listing_id = p_listing_id;
    SELECT COUNT(*) INTO v_hist_ord_count FROM public.orders WHERE listing_id = p_listing_id;

    IF v_hist_req_count > 0 OR v_hist_neg_count > 0 OR v_hist_ord_count > 0 THEN
        -- OPTION B: Historical records exist, physical delete would violate FK
        -- Perform Soft Delete
        UPDATE public.listings SET deleted_at = NOW() WHERE id = p_listing_id;
        RETURN 'SOFT_DELETED';
    ELSE
        -- OPTION A: No historical transactions, physical delete is safe
        -- Clean up listing_images rows first
        DELETE FROM public.listing_images WHERE listing_id = p_listing_id;
        -- Hard delete the listing
        DELETE FROM public.listings WHERE id = p_listing_id;
        RETURN 'HARD_DELETED';
    END IF;
END;
$$;
