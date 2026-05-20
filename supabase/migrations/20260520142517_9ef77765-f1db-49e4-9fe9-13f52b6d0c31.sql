
update storage.buckets set public = false where id = 'submission-photos';
drop policy if exists "submission_photos_public_read" on storage.objects;
create policy "submission_photos_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'submission-photos' and public.is_admin(auth.uid()));
