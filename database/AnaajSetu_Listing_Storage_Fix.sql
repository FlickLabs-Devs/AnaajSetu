-- database/AnaajSetu_Listing_Storage_Fix.sql
-- Fixes the 403 / "new row violates row-level security policy" error on upload
-- by explicitly granting the anon role (used by Firebase) INSERT permission
-- on the 'listings' bucket.

-- Ensure bucket exists and is set to public
INSERT INTO storage.buckets (id, name, public)
VALUES ('listings', 'listings', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Safely drop old policies if they exist (to prevent "policy already exists" errors)
DROP POLICY IF EXISTS "Allow anonymous uploads to listings bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads of listings bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous deletes from listings bucket" ON storage.objects;

-- 1. Allow the application to upload listing images
CREATE POLICY "Allow anonymous uploads to listings bucket" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'listings');

-- 2. Allow public reading of listing images
CREATE POLICY "Allow public reads of listings bucket" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'listings');

-- 3. Allow the application to update/delete images where required (e.g., when editing)
CREATE POLICY "Allow anonymous deletes from listings bucket"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'listings');
