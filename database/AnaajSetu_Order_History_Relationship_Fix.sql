-- AnaajSetu_Order_History_Relationship_Fix.sql
-- Fix missing foreign key relationship between orders and listings

DO $$
BEGIN
    -- Check if there are any orphaned records before adding the constraint
    IF EXISTS (
        SELECT 1
        FROM public.orders o
        LEFT JOIN public.listings l ON l.id = o.listing_id
        WHERE o.listing_id IS NOT NULL AND l.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot add foreign key: there are orphaned listing_id values in the orders table.';
    END IF;

    -- Add the foreign key constraint if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_order_listing'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
        ADD CONSTRAINT fk_order_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.listings(id)
        ON DELETE SET NULL;
    END IF;
END $$;
