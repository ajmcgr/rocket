// Runs the proposed migration in isolated PostgreSQL. No remote DB/Stripe access.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema app_graph;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema auth,app_graph to anon,authenticated,service_role;
create table app_graph.apps(id uuid primary key,name text,tagline text,description text,website_url text,categories text[],platforms text[],launch_url text,launched_at timestamptz,discovered_at timestamptz,is_public boolean);
alter table app_graph.apps enable row level security;
create policy visible_apps on app_graph.apps for select using(is_public);
grant select on app_graph.apps to anon,authenticated;
create view public.public_apps with(security_invoker=true) as select id,name,tagline,description,website_url,categories,platforms,launch_url,launched_at,discovered_at from app_graph.apps where is_public;
grant select on public.public_apps to anon,authenticated,service_role;
create view public.public_app_categories as select 'Tools'::text category,1::integer app_count;
create table public.public_app_intelligence(app_id uuid);
create table public.app_owner_presentations(app_id uuid primary key references app_graph.apps(id),updated_by uuid,updated_at timestamptz default now());
alter table public.app_owner_presentations enable row level security;
create policy visible_details on public.app_owner_presentations for select using(exists(select 1 from public.public_apps where id=app_id));
grant select(app_id) on public.app_owner_presentations to anon,authenticated;
create table public.app_owners(app_id uuid,user_id uuid,revoked_at timestamptz,verification_level text);
create table public.member_public_profiles(user_id uuid,username text,full_name text);
create table public.rocket_editorial_picks(app_id uuid,placement text,headline text,featured_at timestamptz,status text,editorial_note text);
grant select(app_id,placement,headline,featured_at,status) on public.rocket_editorial_picks to anon,authenticated;
create table public.rocket_admin_audit(admin_user_id uuid,action text,target_type text,target_id text,context jsonb);
create function public.is_rocket_admin() returns boolean language sql as $$select auth.uid()='00000000-0000-4000-8000-000000000001'::uuid$$;
create table app_graph.app_reviews(id uuid primary key,app_id uuid,user_id uuid,status text,rating integer,body text,created_at timestamptz);
grant select on app_graph.app_reviews to anon,authenticated;
create view public.public_app_reviews with(security_invoker=true) as select r.* from app_graph.app_reviews r join public.public_apps a on a.id=r.app_id where r.status='published';
grant select on public.public_app_reviews to anon,authenticated;
create view public.public_app_review_summary with(security_invoker=true) as select app_id,count(*)::integer rating_count from public.public_app_reviews group by app_id;
grant select on public.public_app_review_summary to anon,authenticated;
create table public.rocket_oauth_clients(client_id text,app_id uuid,environment text);
create table public.connect_products(id uuid,client_id text,developer_user_id uuid);
create table public.connect_transactions(id uuid,user_id uuid,client_id text,product_id uuid,status text,created_at timestamptz,updated_at timestamptz);
create table public.connect_purchase_grants(purchase_id uuid,user_id uuid,client_id text,product_id uuid,status text);
create table public.connect_entitlements(id uuid,transaction_id uuid,user_id uuid,client_id text,product_id uuid);
create table public.connect_entitlement_events(entitlement_id uuid,event_type text,detail jsonb);
create table public.connect_webhook_events(event_created_at timestamptz,processing_result text,detail jsonb);
create table public.connect_checkout_attempts(client_id text,product_id uuid,created_at timestamptz);
create table public.app_profile_view_counts(app_id uuid,rocket_view_count bigint);
create table public.app_save_counts(app_id uuid,save_count integer);
grant select on public.app_save_counts to anon,authenticated;
create table app_graph.app_profile_view_events(app_id uuid,view_day date);
`);
// Use the repository's actual inbox DDL/grants/RLS, not a permissive mock.
const inboxMigration = readFileSync(
  "supabase/migrations/20261003094133_account_notifications.sql", "utf8",
);
await db.exec(inboxMigration.split("-- Not an RPC:")[0]);
await db.exec(
  readFileSync(
    "supabase/migrations/20260930014009_discover_hygiene_gate.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261004075645_rocket_app_analytics.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261007035432_marketplace_completion.sql",
    "utf8",
  ),
);
await db.exec(
  "grant all on all tables in schema public,app_graph to service_role;grant all on all sequences in schema public,app_graph to service_role",
);
const owner = "00000000-0000-4000-8000-000000000001",
  buyer = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
const app = "00000000-0000-4000-8000-000000000011",
  irrelevant = "00000000-0000-4000-8000-000000000012",
  hidden = "00000000-0000-4000-8000-000000000013",
  bad = "00000000-0000-4000-8000-000000000014",
  product = "00000000-0000-4000-8000-000000000021",
  review = "00000000-0000-4000-8000-000000000031";
await db.query("insert into auth.users values($1),($2),($3)", [
  owner,
  buyer,
  other,
]);
for (const [id, name, isPublic] of [
  [app, "Writer", true],
  [irrelevant, "Unrelated", true],
  [hidden, "Hidden Writer", false],
  [bad, "X", true],
])
  await db.query(
    "insert into app_graph.apps values($1,$2,'Useful independent software for daily tasks',null,'https://example.com',array['Tools'],array['web'],null,now(),$4,$3)",
    [id, name, isPublic, id === app ? "2025-01-01" : new Date().toISOString()],
  );
await db.query(
  "update app_graph.apps set description='Includes Writer tools' where id=$1",
  [irrelevant],
);
await db.query(
  "insert into public.app_owners values($1,$2,null,'domain_verified'),($3,$2,null,'domain_verified')",
  [app, owner, hidden],
);
await db.query(
  "insert into public.member_public_profiles values($1,'builder','Builder')",
  [owner],
);
await db.query(
  "insert into public.rocket_oauth_clients values('live',$1,'production'),('test',$1,'test'),('foreign',$2,'production')",
  [app, irrelevant],
);
await db.query(
  "insert into public.connect_products values($1,'live',$2),($3,'test',$2)",
  [product, owner, hidden],
);
await db.query(
  "insert into public.connect_transactions values(gen_random_uuid(),$1,'live',$2,'refunded',now(),now()),(gen_random_uuid(),$1,'test',$3,'paid',now(),now())",
  [buyer, product, hidden],
);
await db.exec(
  "insert into public.connect_purchase_grants select id,user_id,client_id,product_id,'refunded' from public.connect_transactions where status='refunded'",
);
await db.exec(
  "insert into public.connect_webhook_events select now(),'applied',jsonb_build_object('purchase_id',id,'status','refunded') from public.connect_transactions where status='refunded'",
);
await db.query(
  "insert into public.connect_transactions values(gen_random_uuid(),$1,'live',$2,'expired',now(),now()),(gen_random_uuid(),$1,'live',$2,'past_due',now(),now())",
  [other, product],
);
await db.query(
  "insert into app_graph.app_reviews values($1,$2,$3,'published',1,'An honest negative review',now())",
  [review, app, buyer],
);
async function as(role, user, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('test.uid',$1,false)", [user || ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(name, args = []) {
  return (await db.query(name, args)).rows;
}
await as("authenticated", owner, () =>
  rpc("select set_app_marketplace_details($1,$2)", [
    app,
    {
      pricing_kind: "paid",
      billing_model: "one_time",
      support_url: "https://example.com/support",
      outcome: "Write something useful",
    },
  ]),
);
await assert.rejects(
  as("authenticated", other, () =>
    rpc("select set_app_marketplace_details($1,$2)", [
      app,
      { pricing_kind: "free" },
    ]),
  ),
  /ownership/,
);
await assert.rejects(
  as("authenticated", owner, () =>
    rpc("select set_app_marketplace_details($1,$2)", [
      app,
      { support_url: "javascript:alert(1)" },
    ]),
  ),
  /check constraint/,
);
await as("anon", null, async () => {
  const search = (
    await rpc("select search_marketplace('Writer',p_limit=>1) result")
  )[0].result;
  assert.equal(search.apps[0].id, app);
  assert.equal(search.total, 2);
  assert.equal(
    (
      await rpc(
        "select search_marketplace('Writer',p_limit=>1,p_offset=>1) result",
      )
    )[0].result.apps[0].id,
    irrelevant,
  );
  assert.equal(
    (await rpc("select search_marketplace(p_pricing=>'free') result"))[0].result
      .total,
    0,
  );
  assert.equal(
    (
      await rpc(
        "select search_marketplace(p_pricing=>'paid',p_billing=>'one_time',p_platform=>'web') result",
      )
    )[0].result.total,
    1,
  );
  assert.equal(
    (await rpc("select search_marketplace(p_pricing=>'unknown') result"))[0]
      .result.total,
    1,
  );
  assert.deepEqual((await rpc("select get_app_developer($1) d", [app]))[0].d, {
    username: "builder",
    full_name: "Builder",
  });
  assert.equal(
    (await rpc("select get_public_member_apps('builder')")).length,
    1,
  );
});
console.log(
  "PASS: actual migration; relevance-before-pagination, unknown≠free, pricing/billing/platform, eligibility, canonical developer, owner-only details",
);
await as("authenticated", buyer, () =>
  rpc(
    "select set_marketplace_follow($1,true),set_marketplace_follow('developer:builder',true)",
    ["app:" + app],
  ),
);
await assert.rejects(
  as("authenticated", other, () =>
    rpc("select set_marketplace_follow($1,true)", ["app:" + hidden]),
  ),
  /Public follow/,
);
await as("authenticated", other, async () => {
  assert.equal((await rpc("select * from marketplace_follows")).length, 0);
  await rpc("delete from marketplace_follows");
});
await assert.rejects(
  as("authenticated", buyer, () =>
    rpc("select publish_app_release($1,$2,$3,$4)", [
      review,
      app,
      "v1",
      "A meaningful new capability.",
    ]),
  ),
  /ownership/,
);
await as("authenticated", owner, async () => {
  for (let i = 0; i < 3; i++)
    await rpc("select publish_app_release($1,$2,$3,$4)", [
      review,
      app,
      "v1",
      "A meaningful new capability.",
    ]);
});
assert.equal((await rpc("select * from account_notifications")).length, 1);
await as("authenticated", other, async () => {
  assert.equal((await rpc("select * from account_notifications")).length, 0);
  assert.equal((await rpc("update account_notifications set read_at=now() returning id")).length, 0);
  assert.equal((await rpc("delete from marketplace_follows returning user_id")).length, 0);
});
await as("authenticated", buyer, async () => {
  assert.equal((await rpc("select * from account_notifications")).length, 1);
  assert.equal((await rpc("update account_notifications set read_at=now() returning id")).length, 1);
});
await assert.rejects(as("authenticated", other, () => rpc(
  "insert into account_notifications(user_id,kind,title) values($1,'system','Spoofed inbox')", [buyer],
)), /row-level security/);
await assert.rejects(as("authenticated", buyer, () => rpc(
  "insert into account_notifications(user_id,kind,title) values($1,'app','Spoofed release')", [buyer],
)), /row-level security/);
await assert.rejects(as("authenticated", buyer, () => rpc(
  "update account_notifications set user_id=$1", [other],
)), /permission denied/);
await as("authenticated", buyer, async () => {
  await rpc("select set_marketplace_follow($1,false)", ["app:" + app]);
  await rpc("select set_marketplace_follow('developer:builder',false)");
});
await as("authenticated", owner, () =>
  rpc("select publish_app_release($1,$2,$3,$4)", [
    product,
    app,
    "v2",
    "Another meaningful capability.",
  ]),
);
assert.equal((await rpc("select * from account_notifications")).length, 1);
console.log(
  "PASS: follow RLS, explicit consent, double-target deduplication, release replay idempotency, unsubscribe prevents future updates",
);
await as("anon", null, async () => {
  assert.equal(
    (await rpc("select * from get_app_review_purchase_labels($1)", [app]))[0]
      .purchase_label,
    "Verified purchase · refunded",
  );
});
const unpaidReview = "00000000-0000-4000-8000-000000000032";
await db.query(
  "insert into app_graph.app_reviews values($1,$2,$3,'published',2,'Unpaid reviewer remains legitimate',now())",
  [unpaidReview, app, other],
);
await as("anon", null, async () => {
  assert.equal(
    (await rpc("select * from get_app_review_purchase_labels($1)", [app]))
      .length,
    1,
  );
});
await db.query(
  "insert into public.connect_transactions values($1,$2,'live',$3,'past_due',now(),now())",
  [review, other, product],
);
await db.query(
  "insert into public.connect_entitlements values($1,$1,$2,'live',$3)",
  [review, other, product],
);
await db.query(
  "insert into public.connect_entitlement_events values($1,'invoice.paid',$2)",
  [review, { status: "active", transaction_id: review }],
);
await as("anon", null, async () => {
  assert.equal(
    (await rpc("select * from get_app_review_purchase_labels($1)", [app]))
      .length,
    2,
  );
});
await assert.rejects(
  as("authenticated", buyer, () =>
    rpc("select respond_app_review($1,$2)", [
      review,
      "Fake developer response",
    ]),
  ),
  /ownership/,
);
await as("authenticated", owner, () =>
  rpc("select respond_app_review($1,$2)", [
    review,
    "Thank you for this honest feedback.",
  ]),
);
assert.equal(
  (await rpc("select body from app_graph.app_reviews where id=$1", [review]))[0]
    .body,
  "An honest negative review",
);
await as("authenticated", buyer, () =>
  rpc("select report_marketplace_app($1,$2)", [
    app,
    "This listing needs moderation.",
  ]),
);
await assert.rejects(
  as("authenticated", buyer, () => rpc("select moderate_app_reports()")),
  /Admin access/,
);
await assert.rejects(
  as("anon", null, () => rpc("select * from app_reports")),
  /permission denied/,
);
const reportId = await as("authenticated", owner, async () => {
  const r = (await rpc("select moderate_app_reports() reports"))[0].reports;
  assert.equal(r.length, 1);
  assert.equal(r[0].user_id, undefined);
  return r[0].id;
});
await as("authenticated", owner, () =>
  rpc("select moderate_app_reports($1)", [reportId]),
);
console.log(
  "PASS: refunded negative review retained, historical production purchase labels, response ownership, reports private, moderation admin-only and audited",
);
await as("service_role", null, async () => {
  for (let i = 0; i < 3; i++)
    await rpc("select record_marketplace_click($1,$2,$3)", [
      app,
      "rocket_badge",
      "a".repeat(64),
    ]);
  await rpc("select record_marketplace_click($1,$2,$3)", [
    bad,
    "direct",
    "b".repeat(64),
  ]);
  const result = (
    await rpc("select get_owned_app_rocket_analytics($1,$2) result", [
      app,
      owner,
    ])
  )[0].result;
  assert.equal(result.commerce.outbound_clicks, 1);
  assert.equal(result.commerce.verified_purchases, 2);
  assert.equal(result.commerce.refunds, 1);
  assert.equal(result.commerce.outbound_sources.rocket_badge, 1);
  assert.equal(JSON.stringify(result).includes("visitor_hash"), false);
  await assert.rejects(
    rpc("select get_owned_app_rocket_analytics($1,$2)", [app, other]),
    /ownership/,
  );
});
await assert.rejects(
  as("authenticated", buyer, () =>
    rpc("select get_owned_app_rocket_analytics($1,$2)", [app, owner]),
  ),
  /permission denied/,
);
await assert.rejects(
  as("authenticated", buyer, () =>
    rpc("select record_marketplace_click($1,$2,$3)", [
      app,
      "direct",
      "a".repeat(64),
    ]),
  ),
  /permission denied/,
);
console.log(
  "PASS: same analytics RPC, deduplicated eligible clicks, verified production-only orders/refunds, merchant ownership and service-only ingestion",
);
// Red-team every new mutating definer API as anon and a missing-UID session.
const mutations = [
  ["select set_app_marketplace_details($1,$2)", [app, { pricing_kind: "free" }]],
  ["select set_rocket_pick_collection($1,$2)", [app, "build"]],
  ["select set_marketplace_follow($1,true)", ["app:" + app]],
  ["select publish_app_release($1,$2,$3,$4)", [product, app, "attack", "An unauthorized release note."]],
  ["select respond_app_review($1,$2)", [review, "An unauthorized response."]],
  ["select report_marketplace_app($1,$2)", [app, "An unauthenticated report."]],
  ["select moderate_app_reports()", []],
];
for (const [sql, params] of mutations) {
  await assert.rejects(as("anon", null, () => rpc(sql, params)), /permission denied/);
  await assert.rejects(as("authenticated", null, () => rpc(sql, params)));
}
for (const role of ["anon", "authenticated"]) {
  for (const table of ["app_reports", "app_graph.marketplace_clicks", "connect_transactions", "connect_purchase_grants", "connect_entitlements", "rocket_oauth_clients", "connect_products"]) {
    await assert.rejects(as(role, other, () => rpc(`select * from ${table}`)), /permission denied/);
  }
  await assert.rejects(as(role, other, () => rpc(
    "select app_graph.marketplace_transaction_paid($1)", [review],
  )), /permission denied/);
}
await assert.rejects(as("anon", null, () => rpc("select * from marketplace_follows")), /permission denied/);
await assert.rejects(as("anon", null, () => rpc("select * from account_notifications")), /permission denied/);
await assert.rejects(as("authenticated", other, () => rpc(
  "insert into marketplace_follows(user_id,target) values($1,$2)", [buyer, "app:" + app],
)), /permission denied/);
await assert.rejects(as("authenticated", other, () => rpc("select set_rocket_pick_collection($1,$2)", [app, "build"])), /Admin/);
for (const table of ["app_releases", "app_review_responses"]) {
  await assert.rejects(as("authenticated", other, () => rpc(`delete from ${table}`)), /permission denied/);
}
console.log("PASS: anon/missing-UID mutating RPC denial; actual inbox RLS cross-user read/update/insert denial; direct private-state and service-only proof denial");
await db.query(
  "update public.app_owners set revoked_at=now() where app_id=$1",
  [app],
);
await as("anon", null, async () => {
  assert.equal(
    (await rpc("select * from public_marketplace_details")).length,
    0,
  );
  assert.equal((await rpc("select get_app_developer($1) d", [app]))[0].d, null);
});
assert.equal(
  (
    await rpc(
      "select support_url from app_owner_presentations where app_id=$1",
      [app],
    )
  )[0].support_url,
  null,
);
console.log(
  "PASS: ownership revocation clears stale declarations and attribution; unpaid expired/past-due orders are not purchase proof",
);
await db.query("update app_graph.apps set is_public=false where id=$1", [app]);
await as("anon", null, async () => {
  assert.equal(
    (await rpc("select get_public_member_apps('builder')")).length,
    0,
  );
  assert.equal((await rpc("select * from app_releases")).length, 0);
});
await db.close();
