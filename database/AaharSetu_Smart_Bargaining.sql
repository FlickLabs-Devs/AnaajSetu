-- ============================================================
-- AaharSetu Smart Bargaining Migration
-- Safe to run against the existing AaharSetu database
-- ============================================================

-- ============================================================
-- STEP 1: Create negotiations table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.negotiations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    buyer_id TEXT NOT NULL,
    farmer_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'accepted', 'rejected', 'cancelled', 'expired')),
    current_offer_id UUID, -- Will be set once the first offer is inserted
    final_price_per_unit NUMERIC,
    final_quantity NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    CONSTRAINT fk_negotiation_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.listings (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_negotiation_buyer
        FOREIGN KEY (buyer_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_negotiation_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE
);

-- ============================================================
-- STEP 2: Create negotiation_offers table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.negotiation_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    negotiation_id UUID NOT NULL,
    offered_by TEXT NOT NULL,
    price_per_unit NUMERIC NOT NULL CHECK (price_per_unit >= 0),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    message TEXT,
    offer_number INTEGER NOT NULL,
    offer_type TEXT NOT NULL CHECK (offer_type IN ('initial', 'counter')),
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_offer_negotiation
        FOREIGN KEY (negotiation_id)
        REFERENCES public.negotiations (id)
        ON DELETE CASCADE,
        
    CONSTRAINT fk_offer_offered_by
        FOREIGN KEY (offered_by)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE
);

-- Add foreign key constraint for current_offer_id now that the offers table exists
-- Doing this safely by checking if constraint exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_current_offer' 
        AND conrelid = 'public.negotiations'::regclass
    ) THEN
        ALTER TABLE public.negotiations 
        ADD CONSTRAINT fk_current_offer 
        FOREIGN KEY (current_offer_id) 
        REFERENCES public.negotiation_offers (id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- STEP 3: Create Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_negotiations_buyer_id ON public.negotiations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_farmer_id ON public.negotiations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_listing_id ON public.negotiations(listing_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_status ON public.negotiations(status);
CREATE INDEX IF NOT EXISTS idx_negotiation_offers_negotiation_id ON public.negotiation_offers(negotiation_id);

-- ============================================================
-- STEP 4: updated_at Trigger
-- ============================================================
DROP TRIGGER IF EXISTS update_negotiations_updated_at ON public.negotiations;
CREATE TRIGGER update_negotiations_updated_at
    BEFORE UPDATE ON public.negotiations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 5: Row Level Security (Consistent with existing schema)
-- ============================================================

ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_offers ENABLE ROW LEVEL SECURITY;

-- negotiations policies
DROP POLICY IF EXISTS "anon_select_negotiations" ON public.negotiations;
DROP POLICY IF EXISTS "anon_insert_negotiations" ON public.negotiations;
DROP POLICY IF EXISTS "anon_update_negotiations" ON public.negotiations;
DROP POLICY IF EXISTS "anon_delete_negotiations" ON public.negotiations;

CREATE POLICY "anon_select_negotiations" ON public.negotiations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_negotiations" ON public.negotiations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_negotiations" ON public.negotiations FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_negotiations" ON public.negotiations FOR DELETE TO anon USING (true);

-- negotiation_offers policies
DROP POLICY IF EXISTS "anon_select_negotiation_offers" ON public.negotiation_offers;
DROP POLICY IF EXISTS "anon_insert_negotiation_offers" ON public.negotiation_offers;
DROP POLICY IF EXISTS "anon_update_negotiation_offers" ON public.negotiation_offers;
DROP POLICY IF EXISTS "anon_delete_negotiation_offers" ON public.negotiation_offers;

CREATE POLICY "anon_select_negotiation_offers" ON public.negotiation_offers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_negotiation_offers" ON public.negotiation_offers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_negotiation_offers" ON public.negotiation_offers FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_negotiation_offers" ON public.negotiation_offers FOR DELETE TO anon USING (true);

-- ============================================================
-- STEP 6: Realtime Publication
-- ============================================================

-- Add to publication if not already present
DO $$
BEGIN
    -- Check for negotiations
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'negotiations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.negotiations;
    END IF;

    -- Check for negotiation_offers
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'negotiation_offers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.negotiation_offers;
    END IF;
END $$;
