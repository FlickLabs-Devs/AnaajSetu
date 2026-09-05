-- AnaajSetu Phase 4: Buyer Requests

CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    buyer_id TEXT NOT NULL,
    farmer_id TEXT NOT NULL,
    requested_quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    offered_price_per_unit NUMERIC NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_requested_quantity CHECK (requested_quantity > 0),
    CONSTRAINT valid_offered_price CHECK (offered_price_per_unit >= 0),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed')),

    -- Foreign Keys
    CONSTRAINT fk_request_listing FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE,
    CONSTRAINT fk_request_buyer FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_request_farmer FOREIGN KEY (farmer_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_requests_buyer_id ON public.requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_requests_farmer_id ON public.requests(farmer_id);
CREATE INDEX IF NOT EXISTS idx_requests_listing_id ON public.requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_requests_updated_at ON public.requests;
CREATE TRIGGER update_requests_updated_at
    BEFORE UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- For this prototype, allowing anon access since we rely on Firebase Auth via client-side filters.
-- In production, policies should enforce that buyer_id = auth.uid() or farmer_id = auth.uid().
CREATE POLICY "Allow anon select requests" ON public.requests FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert requests" ON public.requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update requests" ON public.requests FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete requests" ON public.requests FOR DELETE TO anon USING (true);
