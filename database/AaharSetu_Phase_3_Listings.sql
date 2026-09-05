-- AaharSetu Phase 3: Listings Database Migration

-- Create the listings table
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id TEXT NOT NULL,
    produce_name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    price_per_unit NUMERIC NOT NULL CHECK (price_per_unit >= 0),
    quality TEXT NOT NULL,
    availability_start DATE NOT NULL,
    availability_end DATE NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    locality TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'sold_out')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure availability_end is not before availability_start
    CONSTRAINT valid_availability CHECK (availability_end >= availability_start),
    
    -- Foreign key to profiles
    CONSTRAINT fk_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE
);

-- Create the listing_images table
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign key to listings
    CONSTRAINT fk_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.listings (id)
        ON DELETE CASCADE
);

-- Create Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_listings_farmer_id ON public.listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at);
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id ON public.listing_images(listing_id);

-- Setup Row Level Security (RLS) for listings
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;

-- Note: Because we are using Firebase Auth and not Supabase Auth in this prototype, 
-- we will use anon-based policies. For a production app, this would be restricted 
-- using a custom JWT from Firebase or mapping Firebase UID to Supabase Auth.
-- For this prototype, we allow anon access, but the client JS will filter by farmer_id.
CREATE POLICY "Allow anon select listings" ON public.listings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert listings" ON public.listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update listings" ON public.listings FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete listings" ON public.listings FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select listing_images" ON public.listing_images FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert listing_images" ON public.listing_images FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete listing_images" ON public.listing_images FOR DELETE TO anon USING (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to listings
DROP TRIGGER IF EXISTS update_listings_updated_at ON public.listings;
CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON public.listings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
