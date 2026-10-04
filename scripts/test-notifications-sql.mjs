// In-memory Postgres: no fake notifications, users, purchases or subscriptions in production.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const pg = new PGlite();
const tables=['app_submission_details','app_owner_presentations','app_jobs','app_claims','app_owners','app_data_connections','app_revenue_connections','rocket_oauth_clients','connect_developer_accounts','connect_products','connect_transactions','rocket_developer_memberships','subscriptions','payments','credit_transactions'];
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema app_graph; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table app_graph.apps(id uuid primary key,name text,slug text);
`);
for (const table of tables) await pg.exec(`create table public.${table} (
 id uuid primary key default gen_random_uuid(), user_id uuid,owner_user_id uuid,submitted_by uuid,created_by uuid,developer_user_id uuid,updated_by uuid,app_id uuid,
 client_id text,environment text default 'production', status text,verification_level text, revoked_at timestamptz,provider text,
 is_active boolean default false,redirect_uris text[],charges_enabled boolean default false,payouts_enabled boolean default false,is_current boolean default true,
 integration_confirmed_at timestamptz,product_id uuid,stripe_invoice_id text,stripe_subscription_id text,
 cancel_at_period_end boolean default false,current_period_end timestamptz,plan text,kind text,credits int);`);
await pg.exec(readFileSync(new URL('../supabase/migrations/20261003094133_account_notifications.sql',import.meta.url),'utf8'));
const user='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',app='00000000-0000-0000-0000-000000000003',product='00000000-0000-0000-0000-000000000004';
await pg.exec(`insert into auth.users values('${user}'),('${other}'); insert into app_graph.apps values('${app}','Example','example');`);
await pg.exec('grant all on all tables in schema public to service_role; set role service_role');
const count=async()=>Number((await pg.query('select count(*) n from public.account_notifications')).rows[0].n);
const insert=async(table,fields)=> {
 const columns=Object.keys(fields), values=Object.values(fields);
 await pg.query(`insert into public.${table}(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,values);
};
const expectEvent=async(table,fields,title)=>{ const before=await count(); await insert(table,fields); assert.equal(await count(),before+1,`${table} captures exactly one event`); assert.equal((await pg.query('select title from public.account_notifications order by created_at desc limit 1')).rows[0].title,title); };
await expectEvent('app_submission_details',{app_id:app,submitted_by:user},'App published');
await expectEvent('app_owner_presentations',{app_id:app,updated_by:user},'App listing updated');
assert.equal((await pg.query("select href from public.account_notifications where title='App published'")).rows[0].href,'/apps/example');
await expectEvent('app_jobs',{user_id:user,status:'failed'},'App submission needs attention');
await expectEvent('app_claims',{user_id:user,app_id:app,status:'review'},'App claim under review');
await expectEvent('app_owners',{user_id:user,app_id:app,verification_level:'claimed'},'App claimed');
await pg.exec(`update public.app_owners set verification_level='domain_verified' where app_id='${app}'`);
assert.equal((await pg.query("select count(*)::int n from public.account_notifications where title='App ownership verified'")).rows[0].n,1);
const beforeRetry=await count(); await pg.exec(`update public.app_owners set verification_level='domain_verified' where app_id='${app}'`); assert.equal(await count(),beforeRetry,'same-state replay does not duplicate alerts');
await expectEvent('app_data_connections',{owner_user_id:user,app_id:app,provider:'posthog',status:'active'},'PostHog connected');
await expectEvent('app_revenue_connections',{owner_user_id:user,status:'error'},'Revenue verification needs attention');
await expectEvent('rocket_oauth_clients',{created_by:user,app_id:app,client_id:'example',is_active:true},'Rocket ID configured');
await expectEvent('connect_developer_accounts',{developer_user_id:user,client_id:'example',status:'active',charges_enabled:true,payouts_enabled:true},'Merchant account ready');
await expectEvent('connect_products',{id:product,developer_user_id:user,client_id:'example',is_active:false},'Access plan created');
const beforeSale=await count(); await insert('connect_transactions',{user_id:other,product_id:product,client_id:'example',status:'paid'}); assert.equal(await count(),beforeSale+2,'buyer and seller both get payment updates');
const sale=await pg.query("select user_id,href from public.account_notifications where title='App payment confirmed'");
assert.deepEqual(new Map(sale.rows.map(r=>[r.user_id,r.href])),new Map([[user,'/buy-with-rocket'],[other,'/library']]));
await expectEvent('rocket_developer_memberships',{user_id:user,status:'active',cancel_at_period_end:true,current_period_end:'2027-01-01'},'Rocket Developer cancellation scheduled');
await expectEvent('subscriptions',{user_id:user,status:'past_due',plan:'growth',stripe_subscription_id:'sub_test'},'Create plan payment needs attention');
await expectEvent('payments',{user_id:user,status:'succeeded'},'Payment received');
await expectEvent('credit_transactions',{user_id:user,kind:'purchased',credits:100},'Create credits purchased');
const unchanged=await count(); await insert('credit_transactions',{user_id:user,kind:'spent',credits:10}); await insert('app_jobs',{user_id:user,status:'complete'}); assert.equal(await count(),unchanged,'ordinary spend and preview completion are not noisy alerts');
await pg.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
assert.equal((await pg.query('select distinct user_id from public.account_notifications')).rows.length,1,'RLS hides the other account');
await assert.rejects(pg.query(`insert into public.account_notifications(user_id,kind,title) values('${other}','asset','Fake')`));
await assert.rejects(pg.query(`insert into public.account_notifications(user_id,kind,title) values('${user}','billing','Fake payment')`));
await assert.rejects(pg.query(`update public.account_notifications set title='Forged status'`));
await assert.rejects(pg.query(`select notification_private.capture_event()`));
await pg.exec(`insert into public.account_notifications(user_id,kind,title) values('${user}','asset','Logo saved'); update public.account_notifications set read_at=now();`);
assert.equal((await pg.query('select count(*)::int n from public.account_notifications where read_at is null')).rows[0].n,0);
assert.equal((await pg.query(`update public.account_notifications set dismissed_at=now() where user_id='${other}' returning id`)).rows.length,0);
await pg.exec('reset role; set role anon'); await assert.rejects(pg.query('select * from public.account_notifications'));
await pg.exec('reset role'); await pg.close();
console.log('PASS: 15 event sources, publication URL, status/replay filtering, buyer/seller routing, private inbox RLS, protected billing content, own read state, anonymous denial.');
