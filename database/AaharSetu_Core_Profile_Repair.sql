-- ============================================================
-- AaharSetu Core Profile Repair Migration
-- Safe to run — uses IF NOT EXISTS and DROP IF EXISTS
-- Does NOT drop profiles or listings tables
-- ============================================================

-- ============================================================
-- STEP 1: Clean up profiles table
-- Add CHECK constraint on role (safe, only restricts future inserts)
-- ============================================================

-- Add role check constraint if it doesn't exist yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_role_check' 
        AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles 
        ADD CONSTRAINT profiles_role_check 
        CHECK (role IN ('farmer', 'buyer') OR role IS NULL);
    END IF;
END $$;

-- ============================================================
-- STEP 2: Create farmer_profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.farmer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    farm_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_farmer_user
        FOREIGN KEY (user_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE
);

-- ============================================================
-- STEP 3: Create buyer_profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.buyer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    buyer_type TEXT NOT NULL DEFAULT 'household',
    business_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_buyer_user
        FOREIGN KEY (user_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE,

    CONSTRAINT buyer_type_check
        CHECK (buyer_type IN (
            'restaurant', 'cafe', 'local_shop', 'hostel_canteen',
            'food_processor', 'retailer', 'ngo_food_bank', 'household'
        ))
);

-- ============================================================
-- STEP 4: Migrate existing data from profiles into new tables
-- (handles users who completed onboarding before this migration)
-- ============================================================

-- Migrate farmers: if profiles has farm_name column (from Phase 2 schema)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'farm_name'
    ) THEN
        -- Insert into farmer_profiles for all farmer-role profiles
        -- that don't already have a farmer_profiles entry
        INSERT INTO public.farmer_profiles (user_id, farm_name)
        SELECT id, farm_name
        FROM public.profiles
        WHERE role = 'farmer'
        AND id NOT IN (SELECT user_id FROM public.farmer_profiles)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

-- Migrate buyers: if profiles has buyer_type column (from Phase 2 schema)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'buyer_type'
    ) THEN
        INSERT INTO public.buyer_profiles (user_id, buyer_type, business_name)
        SELECT 
            id, 
            COALESCE(buyer_type, 'household'),
            business_name
        FROM public.profiles
        WHERE role = 'buyer'
        AND id NOT IN (SELECT user_id FROM public.buyer_profiles)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

-- ============================================================
-- STEP 5: Create/repair listings table
-- (safe — creates only if not exists)
-- ============================================================
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
    status TEXT NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'paused', 'sold_out')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_availability CHECK (availability_end >= availability_start),

    CONSTRAINT fk_listing_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES public.profiles (id)
        ON DELETE CASCADE
);

-- ============================================================
-- STEP 6: Create/repair listing_images table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_image_listing
        FOREIGN KEY (listing_id)
        REFERENCES public.listings (id)
        ON DELETE CASCADE
);

-- ============================================================
-- STEP 7: Create indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_listings_farmer_id ON public.listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id ON public.listing_images(listing_id);
CREATE INDEX IF NOT EXISTS idx_farmer_profiles_user_id ON public.farmer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_user_id ON public.buyer_profiles(user_id);

-- ============================================================
-- STEP 8: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to farmer_profiles
DROP TRIGGER IF EXISTS update_farmer_profiles_updated_at ON public.farmer_profiles;
CREATE TRIGGER update_farmer_profiles_updated_at
    BEFORE UPDATE ON public.farmer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to buyer_profiles
DROP TRIGGER IF EXISTS update_buyer_profiles_updated_at ON public.buyer_profiles;
CREATE TRIGGER update_buyer_profiles_updated_at
    BEFORE UPDATE ON public.buyer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to listings (if not already applied from Phase 3)
DROP TRIGGER IF EXISTS update_listings_updated_at ON public.listings;
CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 9: Row Level Security
-- All tables use anon-accessible policies (Firebase Auth prototype)
-- ============================================================

-- Enable RLS
ALTER TABLE public.farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;

-- farmer_profiles policies
DROP POLICY IF EXISTS "anon_select_farmer_profiles" ON public.farmer_profiles;
DROP POLICY IF EXISTS "anon_insert_farmer_profiles" ON public.farmer_profiles;
DROP POLICY IF EXISTS "anon_update_farmer_profiles" ON public.farmer_profiles;
DROP POLICY IF EXISTS "anon_delete_farmer_profiles" ON public.farmer_profiles;

CREATE POLICY "anon_select_farmer_profiles" ON public.farmer_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_farmer_profiles" ON public.farmer_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_farmer_profiles" ON public.farmer_profiles FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_farmer_profiles" ON public.farmer_profiles FOR DELETE TO anon USING (true);

-- buyer_profiles policies
DROP POLICY IF EXISTS "anon_select_buyer_profiles" ON public.buyer_profiles;
DROP POLICY IF EXISTS "anon_insert_buyer_profiles" ON public.buyer_profiles;
DROP POLICY IF EXISTS "anon_update_buyer_profiles" ON public.buyer_profiles;
DROP POLICY IF EXISTS "anon_delete_buyer_profiles" ON public.buyer_profiles;

CREATE POLICY "anon_select_buyer_profiles" ON public.buyer_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_buyer_profiles" ON public.buyer_profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_buyer_profiles" ON public.buyer_profiles FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_buyer_profiles" ON public.buyer_profiles FOR DELETE TO anon USING (true);

-- listings policies (drop old ones first)
DROP POLICY IF EXISTS "Allow anon select listings" ON public.listings;
DROP POLICY IF EXISTS "Allow anon insert listings" ON public.listings;
DROP POLICY IF EXISTS "Allow anon update listings" ON public.listings;
DROP POLICY IF EXISTS "Allow anon delete listings" ON public.listings;

CREATE POLICY "anon_select_listings" ON public.listings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_listings" ON public.listings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_listings" ON public.listings FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_listings" ON public.listings FOR DELETE TO anon USING (true);

-- listing_images policies (drop old ones first)
DROP POLICY IF EXISTS "Allow anon select listing_images" ON public.listing_images;
DROP POLICY IF EXISTS "Allow anon insert listing_images" ON public.listing_images;
DROP POLICY IF EXISTS "Allow anon delete listing_images" ON public.listing_images;

CREATE POLICY "anon_select_listing_images" ON public.listing_images FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_listing_images" ON public.listing_images FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_listing_images" ON public.listing_images FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_delete_listing_images" ON public.listing_images FOR DELETE TO anon USING (true);

-- Also ensure profiles has anon policies (safe to re-create)
DROP POLICY IF EXISTS "anon_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon_update_profiles" ON public.profiles;

CREATE POLICY "anon_select_profiles" ON public.profiles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_profiles" ON public.profiles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_profiles" ON public.profiles FOR UPDATE TO anon USING (true);

-- ============================================================
-- STEP 10: Verification queries (run manually in Supabase SQL editor)
-- ============================================================

-- Check all tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Verify farmer data integrity:
-- SELECT p.id, p.full_name, p.role, fp.user_id, fp.farm_name
-- FROM public.profiles p
-- LEFT JOIN public.farmer_profiles fp ON fp.user_id = p.id
-- WHERE p.role = 'farmer';

-- Verify buyer data integrity:
-- SELECT p.id, p.full_name, p.role, bp.user_id, bp.buyer_type
-- FROM public.profiles p
-- LEFT JOIN public.buyer_profiles bp ON bp.user_id = p.id
-- WHERE p.role = 'buyer';
