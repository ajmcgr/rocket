\set ON_ERROR_STOP on
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create schema investor_private;
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
create table public.rocket_oauth_clients(client_id text, app_id uuid, created_by uuid, environment text);
create table public.connect_developer_accounts(id uuid, developer_user_id uuid);
create table public.connect_products(id uuid, name text, billing_type text);
create table public.connect_transactions(id uuid primary key, client_id text, developer_account_id uuid,
  product_id uuid, status text, created_at timestamptz, amount_cents integer,
  application_fee_cents integer, currency text);
create table investor_private.marketplace_payments(id uuid primary key, transaction_id uuid, offer_id uuid,
  merchant_account_id uuid, app_id uuid, livemode boolean, paid_at timestamptz,
  amount_cents bigint, application_fee_cents bigint, currency text);
create table investor_private.marketplace_adjustments(payment_id uuid, kind text, amount_cents bigint);
grant usage on schema auth, investor_private to service_role;
grant select on all tables in schema public, investor_private to service_role;
\ir ../../supabase/migrations/20261112090141_merchant_buy_sales.sql

insert into public.rocket_oauth_clients values
  ('client','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','production');
insert into public.connect_developer_accounts values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111');
insert into public.connect_products values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Pro','subscription'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Licence','one_time');
insert into public.connect_transactions values
  ('10000000-0000-4000-8000-000000000001','client','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','paid',now(),3900,195,'usd'),
  ('10000000-0000-4000-8000-000000000002','client','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','paid',now(),2000,100,'usd'),
  ('10000000-0000-4000-8000-000000000003','client','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','paid',now(),1000,50,'usd');
insert into investor_private.marketplace_payments values
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now(),2000,100,'usd'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now(),1000,50,'usd'),
  ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now(),1000,50,'usd');
insert into investor_private.marketplace_adjustments values
  ('20000000-0000-4000-8000-000000000002','REFUND',500);

set role service_role;
do $$ declare report jsonb; totals jsonb; begin
  report := public.get_owned_buy_sales('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
  totals := report->'currencies'->0;
  if report->>'partial' <> 'true' or jsonb_array_length(report->'recent') <> 4
    or (totals->>'gross_cents')::bigint <> 7900
    or (totals->>'revenue_cents')::bigint <> 7400
    or (totals->>'subscription_revenue_cents')::bigint <> 2000
    or (totals->>'one_time_revenue_cents')::bigint <> 5400
    or (totals->>'gross_platform_fee_cents')::bigint <> 395
    or (totals->>'refund_cents')::bigint <> 500
    or (totals->>'one_time_purchase_count')::bigint <> 2 then
    raise exception 'Incorrect merchant sales report: %', report;
  end if;
  begin
    perform public.get_owned_buy_sales('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
    raise exception 'Other user was allowed to read sales';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
