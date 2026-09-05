-- AnaajSetu Phase 3.1: Listing Enhancements
-- Adds minimum_order_quantity to listings table

-- 1. Add the column (nullable initially to allow safe addition)
ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS minimum_order_quantity NUMERIC;

-- 2. Backfill existing rows safely
-- For existing rows, we set minimum_order_quantity to 1, or to quantity if quantity < 1
UPDATE public.listings
SET minimum_order_quantity = CASE 
    WHEN quantity >= 1 THEN 1 
    ELSE quantity 
END
WHERE minimum_order_quantity IS NULL;

-- 3. Make column NOT NULL
ALTER TABLE public.listings 
ALTER COLUMN minimum_order_quantity SET NOT NULL;

-- 4. Add Constraints
ALTER TABLE public.listings
ADD CONSTRAINT valid_min_order CHECK (minimum_order_quantity > 0 AND minimum_order_quantity <= quantity);
