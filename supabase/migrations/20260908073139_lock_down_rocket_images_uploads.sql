-- The historical dashboard-created policy allowed anonymous uploads anywhere in
-- the public Rocket bucket. Client uploads already use a user-id first path
-- segment, so enforce the same ownership boundary at Storage.
drop policy if exists "storage.objects 1mdautt_1" on storage.objects;
drop policy if exists "rocket-images owner insert" on storage.objects;

create policy "rocket-images owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rocket-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
