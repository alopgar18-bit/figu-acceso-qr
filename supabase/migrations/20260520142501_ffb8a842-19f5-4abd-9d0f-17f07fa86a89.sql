
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-photos',
  'submission-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "submission_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'submission-photos');

create policy "submission_photos_anon_insert"
  on storage.objects for insert
  with check (bucket_id = 'submission-photos');
