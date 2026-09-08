drop policy if exists "rocket-images owner update" on storage.objects;

create policy "rocket-images owner update"
on storage.objects
for update to authenticated
using (
  bucket_id = 'rocket-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'rocket-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
