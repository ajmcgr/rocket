import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema app_graph;
create table app_graph.apps(id uuid primary key, is_public boolean);
create table app_graph.app_reviews(id uuid primary key, app_id uuid, user_id uuid,
 rating smallint, body text, created_at timestamptz, updated_at timestamptz, status text);
create table public.member_public_profiles(user_id uuid primary key, username text, email text);
alter table app_graph.apps enable row level security;
alter table app_graph.app_reviews enable row level security;
create policy apps_public on app_graph.apps for select using (is_public);
create policy reviews_public on app_graph.app_reviews for select using (status='published');
grant usage on schema app_graph to anon,authenticated;
grant select on app_graph.apps,app_graph.app_reviews to anon,authenticated;
grant select(username) on public.member_public_profiles to anon,authenticated;
insert into app_graph.apps values ('00000000-0000-0000-0000-000000000001',true);
insert into public.member_public_profiles values ('00000000-0000-0000-0000-000000000002','alex','private@example.invalid');
insert into app_graph.app_reviews values
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',5,'Real review',now(),now(),'published'),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',1,'Hidden review',now(),now(),'hidden');
create view public.public_app_reviews with (security_invoker=true) as
select r.id,r.app_id,r.user_id,r.rating,r.body,r.created_at,r.updated_at
from app_graph.app_reviews r join app_graph.apps a on a.id=r.app_id
where a.is_public and r.status='published';
grant select on public.public_app_reviews to anon,authenticated;
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261007090945_review_author_profiles.sql', import.meta.url), 'utf8'));
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  assert.equal((await db.query('select author_username from public.public_app_reviews')).rows[0].author_username,'alex');
  assert.equal((await db.query("select review_private.public_author_username('00000000-0000-0000-0000-000000000004') as handle")).rows[0].handle,null);
  await assert.rejects(db.query('select user_id,email from public.member_public_profiles'));
  await db.exec('reset role');
}
await db.exec('update app_graph.apps set is_public=false; set role anon');
assert.equal((await db.query('select * from public.public_app_reviews')).rows.length,0);
assert.equal((await db.query("select review_private.public_author_username('00000000-0000-0000-0000-000000000003') as handle")).rows[0].handle,null);
await db.exec('reset role; update app_graph.apps set is_public=true; delete from public.member_public_profiles; set role anon');
assert.equal((await db.query('select author_username from public.public_app_reviews')).rows[0].author_username,null);
await db.close();
console.log('PASS: public author handles, hidden reviews/apps, protected identity fields, and missing profiles (9 assertions).');
