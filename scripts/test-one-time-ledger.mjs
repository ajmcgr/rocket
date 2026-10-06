// Isolated PostgreSQL regression tests; never connects to Stripe or production.
// Supply PGLITE_MODULE pointing to a temporary installed @electric-sql/pglite.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create table rocket_oauth_clients(client_id text primary key,environment text);
create table connect_developer_accounts(id uuid primary key,client_id text,stripe_account_id text);
create table connect_products(id uuid primary key,client_id text,developer_account_id uuid,amount_cents integer,currency text,interval text not null check(interval in ('month','year')));
create table connect_transactions(id uuid primary key,user_id uuid,client_id text,product_id uuid,developer_account_id uuid,stripe_account_id text,stripe_subscription_id text,stripe_payment_intent_id text,amount_cents integer,currency text,status text,updated_at timestamptz);
insert into auth.users values ('00000000-0000-4000-8000-000000000001');
insert into rocket_oauth_clients values ('launch','production'),('other','test');
insert into connect_developer_accounts values ('00000000-0000-4000-8000-000000000002','launch','acct_launch');
insert into connect_products values ('00000000-0000-4000-8000-000000000003','launch','00000000-0000-4000-8000-000000000002',3900,'usd','month');
`);
await db.exec(readFileSync("supabase/migrations/20261006125743_buy_one_time_products.sql", "utf8"));
assert.equal((await db.query("select billing_type from connect_products")).rows[0].billing_type, "subscription");
await db.exec(`insert into connect_products values ('00000000-0000-4000-8000-000000000004','launch','00000000-0000-4000-8000-000000000002',3900,'usd',null,'one_time');
insert into connect_transactions values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','launch','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','acct_launch',null,'pi_one',3900,'usd','pending',now());`);
const settle = (state, env = "production") => db.query("select connect_settle_one_time('00000000-0000-4000-8000-000000000005',$1,$2)", [env,state]);
for (let i=0;i<10;i++) await settle("granted");
assert.deepEqual((await db.query("select quantity,status from connect_purchase_grants")).rows,[{quantity:1,status:"granted"}]);
await settle("refunded"); await settle("granted");
assert.equal((await db.query("select status from connect_purchase_grants")).rows[0].status,"refunded");
await assert.rejects(settle("granted","test"));
await assert.rejects(settle(null));
await db.exec("update connect_transactions set client_id='other'");
await assert.rejects(settle("granted"));
assert.equal((await db.query("select has_function_privilege('authenticated','connect_settle_one_time(uuid,text,text)','EXECUTE') as allowed")).rows[0].allowed,false);
assert.equal((await db.query("select has_table_privilege('anon','connect_purchase_grants','SELECT') as allowed")).rows[0].allowed,false);
await assert.rejects(db.exec("insert into connect_products(id,billing_type,interval) values('00000000-0000-4000-8000-000000000006','one_time','month')"));
await db.close();
console.log("PASS: legacy defaults, one unit across ten replays, refund cannot resurrect, client/mode isolation, RPC/table permissions, billing constraints");
