// Isolated PostgreSQL fixtures only. Never connects to production or Stripe.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${name}`);
}
async function rows(q) {
  return (await db.query(q)).rows;
}
async function denied(name, q) {
  let blocked = false;
  try {
    await db.query(q);
  } catch {
    blocked = true;
  }
  check(name, blocked);
}
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema app_graph; grant usage on schema app_graph to anon,authenticated,service_role;
create table app_graph.apps(id uuid primary key,name text,categories text[],is_public boolean);
create table app_graph.app_reviews(id uuid,app_id uuid,rating integer,status text);
create view public.public_discoverable_apps as select id,name,categories from app_graph.apps where is_public;
create view public.public_app_review_summary as select r.app_id,count(*)::integer rating_count
  from app_graph.app_reviews r join app_graph.apps a on a.id=r.app_id where a.is_public and r.status='published' group by r.app_id;
create table public.app_save_counts(app_id uuid primary key,save_count integer);
create table public.rocket_oauth_clients(client_id text,app_id uuid,environment text);
create table public.connect_developer_accounts(id uuid,client_id text,stripe_account_id text);
create table public.connect_products(id uuid,client_id text,developer_account_id uuid);
create table public.connect_transactions(id uuid,user_id uuid,client_id text,product_id uuid,developer_account_id uuid,stripe_account_id text,amount_cents integer,status text);
create table public.connect_purchase_grants(purchase_id uuid,user_id uuid,client_id text,product_id uuid);
create table public.connect_entitlements(id uuid,user_id uuid,client_id text,product_id uuid);
create table public.connect_entitlement_events(entitlement_id uuid,event_type text,detail jsonb);
grant select on public.public_discoverable_apps,public.public_app_review_summary,public.app_save_counts to anon,authenticated;
alter table public.connect_transactions enable row level security;
alter table public.connect_purchase_grants enable row level security;
insert into app_graph.apps values
('${uuid(1)}','Reviews',array['Tools'],true),('${uuid(2)}','Bookmarks',array['Tools'],true),
('${uuid(3)}','Purchases',array['Other'],true),('${uuid(4)}','Private',array['Tools'],false),
('${uuid(5)}','No activity',array['Tools'],true),('${uuid(6)}','Alpha tie',array['Tools'],true),('${uuid(7)}','Beta tie',array['Tools'],true);
insert into app_graph.app_reviews values('${uuid(21)}','${uuid(1)}',1,'published'),('${uuid(22)}','${uuid(1)}',5,'published'),('${uuid(23)}','${uuid(1)}',5,'rejected'),('${uuid(24)}','${uuid(4)}',5,'published');
insert into public.app_save_counts values('${uuid(2)}',3),('${uuid(4)}',100),('${uuid(6)}',1),('${uuid(7)}',1);
insert into public.rocket_oauth_clients values('live','${uuid(3)}','production'),('test','${uuid(3)}','test'),('private','${uuid(4)}','production');
insert into public.connect_developer_accounts values('${uuid(30)}','live','acct_live'),('${uuid(31)}','test','acct_test'),('${uuid(32)}','private','acct_private');
insert into public.connect_products values('${uuid(40)}','live','${uuid(30)}'),('${uuid(41)}','test','${uuid(31)}'),('${uuid(42)}','private','${uuid(32)}');
`);
const prior = await readFile(
  new URL(
    "../supabase/migrations/20261007035432_marketplace_completion.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(
  prior.slice(
    prior.indexOf("create function app_graph.marketplace_transaction_paid"),
    prior.indexOf("create function public.get_app_review_purchase_labels"),
  ),
);
async function purchase(
  n,
  {
    buyer = n,
    client = "live",
    product = 40,
    account = 30,
    stripe = "acct_live",
    status = "paid",
    amount = 3900,
    proof = "grant",
  } = {},
) {
  await db.exec(
    `insert into public.connect_transactions values('${uuid(n)}','${uuid(buyer + 1000)}','${client}','${uuid(product)}','${uuid(account)}','${stripe}',${amount},'${status}')`,
  );
  if (proof === "grant")
    await db.exec(
      `insert into public.connect_purchase_grants values('${uuid(n)}','${uuid(buyer + 1000)}','${client}','${uuid(product)}')`,
    );
  if (proof === "subscription")
    await db.exec(
      `insert into public.connect_entitlements values('${uuid(n + 2000)}','${uuid(buyer + 1000)}','${client}','${uuid(product)}'); insert into public.connect_entitlement_events values('${uuid(n + 2000)}','invoice.paid',jsonb_build_object('transaction_id','${uuid(n)}','status','active'))`,
    );
  if (proof === "mismatch")
    await db.exec(
      `insert into public.connect_purchase_grants values('${uuid(n)}','${uuid(buyer + 1001)}','${client}','${uuid(product)}')`,
    );
}
await purchase(100, { proof: "grant" });
await purchase(101, { proof: "subscription" });
await purchase(102, { proof: "subscription", buyer: 101 }); // Renewal, same buyer.
await purchase(103, { status: "refunded" });
await purchase(104, { status: "disputed" });
await purchase(105, { status: "pending" });
await purchase(106, { status: "failed" });
await purchase(107, { proof: null });
await purchase(108, {
  client: "test",
  product: 41,
  account: 31,
  stripe: "acct_test",
});
await purchase(109, {
  client: "private",
  product: 42,
  account: 32,
  stripe: "acct_private",
});
await purchase(110, { amount: 0 });
await purchase(111, { account: 31 }); // Cross-merchant binding.
await purchase(112, { stripe: "acct_wrong" });
await purchase(113, { proof: "mismatch" });
await purchase(114, { status: "expired" });
const before = JSON.stringify(
  await rows("select * from public.connect_transactions order by id"),
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20261008084856_rocket_engagement_rankings.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
check(
  "Additive migration preserves financial rows byte-for-byte",
  before ===
    JSON.stringify(
      await rows("select * from public.connect_transactions order by id"),
    ),
);
const ranks = async (args = "'' , 20") =>
  rows(`select * from public.get_public_app_rankings(${args})`);
let ranking = await ranks();
check(
  "Equal-weight reviews/bookmarks/verified distinct buyers determine rank",
  ranking.map((r) => r.app_id).join() === [2, 1, 3, 6, 7].map(uuid).join(),
);
check(
  "Only public IDs and ordinal positions are exposed",
  ranking.every((r) => Object.keys(r).join() === "app_id,rank_position"),
);
check(
  "Private and zero-activity apps are excluded",
  !ranking.some((r) => [uuid(4), uuid(5)].includes(r.app_id)),
);
await db.exec(
  `update public.connect_transactions set status='refunded' where id in ('${uuid(100)}','${uuid(101)}','${uuid(102)}')`,
);
check(
  "All invalid financial fixtures are excluded even when no valid purchases remain",
  !(await ranks()).some((r) => r.app_id === uuid(3)),
);
await db.exec(
  `update public.connect_transactions set status='paid' where id in ('${uuid(100)}','${uuid(101)}','${uuid(102)}')`,
);
check(
  "Published review counts tie-break before bookmarks and app name",
  ranking[1].app_id === uuid(1) && ranking[3].app_id === uuid(6),
);
check(
  "Category filters precede ordinal ranking and limits",
  (await ranks("'Tools',2")).map((r) => r.app_id).join() ===
    [2, 1].map(uuid).join(),
);
check(
  "Unknown category never falls back to global rankings",
  (await ranks("'Missing',20")).length === 0,
);
check(
  "Limit is bounded and null defaults work",
  (await ranks("'',0")).length === 1 && (await ranks("null,null")).length === 5,
);
await purchase(115, { status: "canceling" });
await purchase(116, { status: "past_due" });
check(
  "Historically settled subscriptions count after cancellation/late renewal",
  (await ranks())[0].app_id === uuid(3),
);
await db.exec(
  `update public.connect_transactions set status='refunded' where id='${uuid(115)}'; update public.connect_transactions set status='disputed' where id='${uuid(116)}'`,
);
check(
  "Refunds/disputes immediately remove their contribution",
  (await ranks())[0].app_id === uuid(2),
);
await db.exec(
  `insert into app_graph.app_reviews values('${uuid(25)}','${uuid(1)}',4,'published'),('${uuid(26)}','${uuid(1)}',3,'published')`,
);
check(
  "New published review activity updates rankings",
  (await ranks())[0].app_id === uuid(1),
);
await db.exec(
  `update public.app_save_counts set save_count=5 where app_id='${uuid(2)}'`,
);
check(
  "Current bookmark activity updates rankings",
  (await ranks())[0].app_id === uuid(2),
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  check(
    `${role} can read safe ranking positions`,
    (await ranks()).length === 5,
  );
  await denied(
    `${role} cannot read transaction/buyer data`,
    "select * from public.connect_transactions",
  );
  await denied(
    `${role} cannot read payment grants`,
    "select * from public.connect_purchase_grants",
  );
  await denied(
    `${role} cannot call paid-proof helper`,
    `select app_graph.marketplace_transaction_paid('${uuid(100)}')`,
  );
  check(
    `${role} private ranking helper also returns only positions`,
    (await rows("select * from app_graph.rank_marketplace_apps('',20)")).every(
      (r) => Object.keys(r).join() === "app_id,rank_position",
    ),
  );
  await db.exec("reset role");
}
check(
  "Migration creates no triggers/external dispatch",
  (await rows("select * from pg_trigger where not tgisinternal")).length === 0,
);
await db.exec(
  "drop function public.get_public_app_rankings(text,integer); drop function app_graph.rank_marketplace_apps(text,integer)",
);
check(
  "Rollback removes only new functions and preserves financial rows",
  (await rows("select count(*)::integer n from public.connect_transactions"))[0]
    .n === 17,
);
console.log(`${passed} PostgreSQL ranking/privacy/recovery checks passed`);
await db.close();
