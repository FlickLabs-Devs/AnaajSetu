-- AnaajSetu Phase 8: Verified Farmer Feedback

-- 1. Create the farmer_reviews table
CREATE TABLE IF NOT EXISTS public.farmer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE,
    farmer_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_review_order
        FOREIGN KEY (order_id)
        REFERENCES public.orders(id) ON DELETE CASCADE,

    CONSTRAINT fk_review_farmer
        FOREIGN KEY (farmer_id)
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    CONSTRAINT fk_review_buyer
        FOREIGN KEY (buyer_id)
        REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- 2. Create Indexes
CREATE INDEX IF NOT EXISTS idx_farmer_reviews_farmer_id
ON public.farmer_reviews(farmer_id);

CREATE INDEX IF NOT EXISTS idx_farmer_reviews_buyer_id
ON public.farmer_reviews(buyer_id);

CREATE INDEX IF NOT EXISTS idx_farmer_reviews_created_at
ON public.farmer_reviews(created_at DESC);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_farmer_reviews_updated_at ON public.farmer_reviews;
CREATE TRIGGER update_farmer_reviews_updated_at
    BEFORE UPDATE ON public.farmer_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.farmer_reviews ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies
-- Public/Anon can read reviews
CREATE POLICY "Allow anon select reviews" 
ON public.farmer_reviews 
FOR SELECT TO anon 
USING (true);

-- Authenticated can read reviews
CREATE POLICY "Allow authenticated select reviews" 
ON public.farmer_reviews 
FOR SELECT TO authenticated 
USING (true);

-- Buyer can insert a review ONLY if they own the completed order
CREATE POLICY "Allow buyer insert review" 
ON public.farmer_reviews 
FOR INSERT TO authenticated 
WITH CHECK (
    auth.uid() = buyer_id AND
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_id
        AND o.buyer_id = auth.uid()
        AND o.status = 'completed'
    )
);

-- Buyer can update their own review
CREATE POLICY "Allow buyer update own review" 
ON public.farmer_reviews 
FOR UPDATE TO authenticated 
USING (
    auth.uid() = buyer_id
)
WITH CHECK (
    auth.uid() = buyer_id
);

-- 6. Create reputation view
-- This securely aggregates reputation data without multiplication risks.
CREATE OR REPLACE VIEW public.farmer_reputation_view AS
SELECT
    p.id AS farmer_id,
    p.full_name,
    p.locality,
    p.district,
    p.state,
    fp.farm_name,
    p.created_at AS joined_at,
    COALESCE(r.average_rating, 0) AS average_rating,
    COALESCE(r.review_count, 0) AS review_count,
    COALESCE(o_stats.completed_order_count, 0) AS completed_order_count
FROM public.profiles p
LEFT JOIN public.farmer_profiles fp ON fp.user_id = p.id
LEFT JOIN (
    SELECT 
        farmer_id, 
        ROUND(AVG(rating)::numeric, 1) AS average_rating, 
        COUNT(id) AS review_count
    FROM public.farmer_reviews
    GROUP BY farmer_id
) r ON r.farmer_id = p.id
LEFT JOIN (
    SELECT 
        farmer_id, 
        COUNT(id) AS completed_order_count
    FROM public.orders
    WHERE status = 'completed'
    GROUP BY farmer_id
) o_stats ON o_stats.farmer_id = p.id
WHERE p.role = 'farmer';

-- Grant access to the view
GRANT SELECT ON public.farmer_reputation_view TO anon, authenticated;
