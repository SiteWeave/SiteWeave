-- Profile photos storage foundation: public-read avatars with owner-scoped writes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile_photos',
  'profile_photos',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read profile photos" ON storage.objects;
CREATE POLICY "Public read profile photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile_photos');

DROP POLICY IF EXISTS "Users can upload own profile photos" ON storage.objects;
CREATE POLICY "Users can upload own profile photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile_photos'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text
);

DROP POLICY IF EXISTS "Users can update own profile photos" ON storage.objects;
CREATE POLICY "Users can update own profile photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile_photos'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text
)
WITH CHECK (
  bucket_id = 'profile_photos'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text
);

DROP POLICY IF EXISTS "Users can delete own profile photos" ON storage.objects;
CREATE POLICY "Users can delete own profile photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile_photos'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text
);

-- Narrow contacts update policy for avatar management.
DROP POLICY IF EXISTS "Users can update their linked contact avatar" ON public.contacts;
CREATE POLICY "Users can update their linked contact avatar"
ON public.contacts
FOR UPDATE
USING (
  id = (SELECT public.get_user_contact_id())
)
WITH CHECK (
  id = (SELECT public.get_user_contact_id())
);
