-- AaharSetu Phase 8.1: Farmer Feedback RLS Fix

-- We are dropping the strictly authenticated insert/update policies because AaharSetu
-- uses Firebase Authentication and connects to Supabase as 'anon'.
-- Review submission has been migrated to a secure Netlify function that authenticates
-- the Firebase JWT and uses the Service Role Key to insert/update the review.
-- Read access ('Allow anon select reviews') is retained so the UI can still load reviews.

DROP POLICY IF EXISTS "Allow buyer insert review" ON public.farmer_reviews;
DROP POLICY IF EXISTS "Allow buyer update own review" ON public.farmer_reviews;

-- Ensure RLS is still enabled so nobody can maliciously insert reviews from the client.
ALTER TABLE public.farmer_reviews ENABLE ROW LEVEL SECURITY;
