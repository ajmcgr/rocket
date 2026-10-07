// Runs real PostgreSQL RLS/column grants/trigger behavior in isolated PGlite.
// Set PGLITE_MODULE to an installed @electric-sql/pglite module if not in this workspace.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const APP1 = "20000000-0000-4000-8000-000000000001";
const APP2 = "20000000-0000-4000-8000-000000000002";
const HIDDEN = "20000000-0000-4000-8000-000000000003";
let passed = 0;
function check(name, result) {
  assert.ok(result, name);
  passed++;
  console.log(`PASS ${name}`);
}
async function rows(query) {
  return (await db.query(query)).rows;
}
async function role(user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user || "",
  ]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
}
async function denies(name, query) {
  let denied = false;
  try {
    await db.exec(query);
  } catch {
    denied = true;
  }
  check(name, denied);
}
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema app_graph;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
create table app_graph.apps(id uuid primary key,name text,logo_url text,is_public boolean);
create view public.public_apps as select id,name,logo_url from app_graph.apps where is_public;
create table public.member_public_profiles(user_id uuid primary key,username text,full_name text,avatar_url text);
grant select on public.public_apps to anon,authenticated;
grant select on public.member_public_profiles to authenticated;
grant select(username,full_name,avatar_url) on public.member_public_profiles to anon;
create table public.saved_apps(user_id uuid references auth.users,app_id uuid references app_graph.apps,saved_at timestamptz default now(),primary key(user_id,app_id));
alter table public.saved_apps enable row level security;
create policy saves_owner on public.saved_apps to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,delete on public.saved_apps to authenticated;
insert into auth.users values('${A}'),('${B}');
insert into app_graph.apps values('${APP1}','App One','https://example.com/1.png',true),('${APP2}','App Two','https://example.com/2.png',true),('${HIDDEN}','Restricted','https://example.com/secret.png',false);
insert into public.member_public_profiles values('${A}','user_a','User A',null),('${B}','user_b','User B',null);
insert into public.saved_apps(user_id,app_id) values('${A}','${APP1}'),('${A}','${APP2}'),('${B}','${APP2}');
`);
const baseline = await rows(
  "select * from public.saved_apps order by user_id,app_id",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20261007080910_user_app_collections.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(await readFile(new URL('../supabase/migrations/20261007085046_user_collection_public_curators.sql', import.meta.url),'utf8'));
check(
  "Migration preserves saved rows byte-for-byte",
  JSON.stringify(
    await rows("select * from public.saved_apps order by user_id,app_id"),
  ) === JSON.stringify(baseline),
);
await role(A);
check(
  "Default Saved shows existing two apps",
  Number(
    (await rows("select app_count from public.my_saved_collection"))[0]
      .app_count,
  ) === 2,
);
const c = (
  await rows(
    "insert into public.user_collections(name) values('Rocket Test Collection') returning *",
  )
)[0];
check(
  "New collection defaults private and derives owner",
  c.visibility === "private" && c.owner_id === A,
);
await db.exec(
  `insert into public.collection_apps(collection_id,app_id) values('${c.id}','${APP1}'),('${c.id}','${APP2}')`,
);
await db.exec(
  `insert into public.collection_apps(collection_id,app_id) values('${c.id}','${APP1}') on conflict do nothing`,
);
check(
  "Duplicate Add is idempotent",
  (
    await rows(
      `select * from public.collection_apps where collection_id='${c.id}'`,
    )
  ).length === 2,
);
check(
  "Public projection excludes private data even for owner",
  (await rows("select * from public.public_user_collections")).length === 0,
);
await denies(
  "Cannot spoof collection owner",
  `insert into public.user_collections(name,owner_id) values('Spoof','${B}')`,
);
await denies(
  "Cannot supply a stable slug",
  "insert into public.user_collections(name,slug) values('Spoof','saved')",
);
await denies(
  "Cannot add hidden listing",
  `insert into public.collection_apps(collection_id,app_id) values('${c.id}','${HIDDEN}')`,
);
await role(B);
check(
  "User B cannot read private collection or memberships",
  (await rows(`select * from public.user_collections where id='${c.id}'`))
    .length === 0 &&
    (
      await rows(
        `select * from public.collection_apps where collection_id='${c.id}'`,
      )
    ).length === 0,
);
await db.exec(
  `update public.user_collections set visibility='public',name='Hacked' where id='${c.id}'; delete from public.collection_apps where collection_id='${c.id}'; delete from public.user_collections where id='${c.id}';`,
);
await denies(
  "User B cannot insert membership",
  `insert into public.collection_apps(collection_id,app_id) values('${c.id}','${APP1}')`,
);
await role(null);
await denies('Protected profile user_id stays private to anonymous', 'select user_id from public.member_public_profiles');
check('Private curator helper exposes no private identity', (await rows(`select * from collection_private.public_curator('${c.id}')`)).length === 0);
check(
  "Anonymous cannot read private collection or apps",
  (await rows("select * from public.public_user_collections")).length === 0 &&
    (await rows("select * from public.collection_visible_apps")).length === 0,
);
await denies(
  "Anonymous cannot mutate collections",
  "insert into public.user_collections(name) values('Anon')",
);
await denies(
  "Anonymous cannot read Saved",
  "select * from public.my_saved_collection",
);
await role(A);
check(
  "Cross-user mutations changed nothing",
  (
    await rows(
      `select name,visibility from public.user_collections where id='${c.id}'`,
    )
  )[0].name === "Rocket Test Collection",
);
await db.exec(
  `update public.user_collections set visibility='public' where id='${c.id}'`,
);
await role(B);
check(
  "User B can read public collection",
  (
    await rows(
      `select * from public.public_user_collections where slug='${c.slug}'`,
    )
  ).length === 1,
);
await role(null);
check('Anonymous public collection contains published curator without protected ID grant', (await rows(`select username from public.public_user_collections where id='${c.id}'`))[0].username === 'user_a');
await role(B);
check(
  "Public profile projection contains populated collection",
  (
    await rows(
      "select * from public.public_user_collections where username='user_a' and app_count>0",
    )
  ).length === 1,
);
await db.exec(
  `update public.user_collections set name='Hacked' where id='${c.id}'; delete from public.collection_apps where collection_id='${c.id}';`,
);
await role(A);
await db.exec(
  `update public.user_collections set name='Renamed' where id='${c.id}'`,
);
check(
  "Rename preserves stable slug",
  (
    await rows(
      `select slug,name from public.user_collections where id='${c.id}'`,
    )
  )[0].slug === c.slug,
);
const other = (
  await rows(
    "insert into public.user_collections(name) values('Another collection') returning id",
  )
)[0];
await db.exec(
  `insert into public.collection_apps(collection_id,app_id) values('${other.id}','${APP1}')`,
);
check(
  "Same app may belong to multiple collections",
  (await rows(`select * from public.collection_apps where app_id='${APP1}'`))
    .length === 2,
);
await denies(
  "Cannot transfer collection ownership",
  `update public.user_collections set owner_id='${B}' where id='${c.id}'`,
);
await db.exec(
  `delete from public.collection_apps where collection_id='${c.id}' and app_id='${APP2}'; delete from public.collection_apps where collection_id='${c.id}' and app_id='${APP2}';`,
);
check(
  "Remove is safe repeatedly and count is accurate",
  Number(
    (
      await rows(
        `select app_count from public.my_user_collections where id='${c.id}'`,
      )
    )[0].app_count,
  ) === 1,
);
await db.exec("reset role");
await db.exec(`update app_graph.apps set is_public=false where id='${APP1}'`);
await role(null);
check(
  "Hidden listings leak neither count, image nor membership",
  Number(
    (
      await rows(
        `select app_count from public.public_user_collections where id='${c.id}'`,
      )
    )[0].app_count,
  ) === 0 &&
    (await rows("select * from public.collection_visible_apps")).length === 0 &&
    (await rows("select * from public.collection_apps")).length === 0,
);
check(
  "Empty public collections excluded from discovery",
  (await rows("select * from public.public_user_collections where app_count>0"))
    .length === 0,
);
await db.exec("reset role");
await db.exec(`update app_graph.apps set is_public=true where id='${APP1}'`);
await role(A);
await db.exec(
  `update public.user_collections set visibility='private' where id='${c.id}'`,
);
await role(B);
check(
  "Privacy flip immediately removes public detail/profile/discovery and apps",
  (await rows("select * from public.public_user_collections")).length === 0 &&
    (await rows("select * from public.collection_visible_apps")).length === 0,
);
check(
  "User B personal view cannot read User A state",
  (await rows("select * from public.my_user_collections")).length === 0,
);
await role(A);
await db.exec(
  `delete from public.user_collections where id in ('${c.id}','${other.id}')`,
);
check(
  "Delete cascades memberships only",
  (await rows("select * from public.collection_apps")).length === 0,
);
await db.exec("reset role");
check(
  "Saved and apps preserved after complete lifecycle",
  JSON.stringify(
    await rows("select * from public.saved_apps order by user_id,app_id"),
  ) === JSON.stringify(baseline) &&
    (await rows("select * from app_graph.apps")).length === 3,
);
console.log(
  `${passed} PostgreSQL collection assertions passed. Isolated test database closed; no production data touched.`,
);
await db.close();
