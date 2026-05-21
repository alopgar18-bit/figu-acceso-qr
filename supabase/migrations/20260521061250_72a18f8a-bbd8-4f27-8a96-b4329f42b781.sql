DROP POLICY IF EXISTS submission_photos_anon_insert ON storage.objects;

CREATE POLICY submission_photos_anon_insert
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'submission-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND octet_length(name) < 300
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
      AND e.status = 'publicado'
      AND e.public_registration_enabled = true
  )
);