-- Investor metrics are deliberately separate from operational purchase and
-- entitlement tables. Nothing here changes checkout, settlement or access.
create schema if not exists investor_private;
revoke all on schema investor_private from public, anon, authenticated;

create table investor_private.app_classification (
  app_id uuid primary key references app_graph.apps(id) on delete restrict,
  classification text not null check (classification in ('INDEPENDENT','AFFILIATED','INTERNAL','TEST')),
  effective_at timestamptz not null,
  reason text not null check (length(trim(reason)) >= 10),
  admin_actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table investor_private.app_classification_history (
  id bigint generated always as identity primary key,
  app_id uuid not null,
  classification text not null,
  effective_at timestamptz not null,
  reason text not null,
  admin_actor uuid,
  recorded_at timestamptz not null default now()
);
alter table investor_private.app_classification enable row level security;
alter table investor_private.app_classification_history enable row level security;
revoke all on investor_private.app_classification, investor_private.app_classification_history from public, anon, authenticated;
grant select on investor_private.app_classification, investor_private.app_classification_history to service_role;

create function investor_private.audit_app_classification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into investor_private.app_classification_history(app_id, classification, effective_at, reason, admin_actor)
  values(new.app_id, new.classification, new.effective_at, new.reason, new.admin_actor);
  return new;
end; $$;
create trigger audit_investor_app_classification after insert or update on investor_private.app_classification
for each row execute function investor_private.audit_app_classification();

create function public.rocket_admin_classify_app(p_app_id uuid, p_classification text, p_reason text, p_effective_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  if p_classification not in ('INDEPENDENT','AFFILIATED','INTERNAL','TEST')
    or length(trim(coalesce(p_reason,''))) < 10 or p_effective_at > now() then
    raise exception 'Invalid classification';
  end if;
  insert into investor_private.app_classification(app_id,classification,effective_at,reason,admin_actor)
    values(p_app_id,p_classification,p_effective_at,p_reason,auth.uid())
    on conflict(app_id) do update set classification=excluded.classification,
      effective_at=excluded.effective_at,reason=excluded.reason,admin_actor=excluded.admin_actor,updated_at=now();
end; $$;
revoke all on function public.rocket_admin_classify_app(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.rocket_admin_classify_app(uuid,text,text,timestamptz) to authenticated;

-- Existing founder-owned integrations are recorded explicitly. Unclassified
-- apps fail closed and cannot inflate Connected Apps or Cross-App Users.
insert into investor_private.app_classification(app_id, classification, effective_at, reason)
select c.app_id, 'AFFILIATED', c.created_at,
  'Rocket founder-owned Launch/Media integration; excluded from independent-app metrics'
from public.rocket_oauth_clients c join app_graph.apps a on a.id=c.app_id
where c.environment='production' and a.name in ('Launch','Media')
on conflict(app_id) do nothing;

create table investor_private.oauth_success (
  id bigint generated always as identity primary key,
  token_id uuid unique references public.rocket_oauth_access_tokens(id) on delete set null,
  app_id uuid references app_graph.apps(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  client_id text not null,
  environment text not null check (environment in ('production','test')),
  issued_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
create index oauth_success_app_time on investor_private.oauth_success(app_id,issued_at) where environment='production';
create index oauth_success_user_time on investor_private.oauth_success(user_id,issued_at) where environment='production';
alter table investor_private.oauth_success enable row level security;
revoke all on investor_private.oauth_success from public, anon, authenticated;
grant select on investor_private.oauth_success to service_role;

-- Same transaction as token insertion: an event-write failure prevents token
-- issuance. The token primary key makes duplicate writes idempotent.
create function investor_private.capture_oauth_success() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.rocket_oauth_clients;
begin
  select * into c from public.rocket_oauth_clients where client_id=new.client_id;
  if c.client_id is null then raise exception 'Unknown OAuth client'; end if;
  insert into investor_private.oauth_success(token_id,app_id,user_id,client_id,environment,issued_at)
    values(new.id,c.app_id,new.user_id,new.client_id,c.environment,new.created_at)
    on conflict(token_id) do nothing;
  insert into public.rocket_oauth_events(user_id,client_id,event_type,detail,created_at)
    values(new.user_id,new.client_id,'token_issued',jsonb_build_object('token_id',new.id,'app_id',c.app_id,'environment',c.environment),new.created_at);
  return new;
end; $$;
create trigger capture_investor_oauth_success after insert on public.rocket_oauth_access_tokens
for each row execute function investor_private.capture_oauth_success();
-- Existing token rows are authoritative issuance evidence where still present.
-- Deleted/revoked history cannot be reconstructed and remains marked partial.
insert into investor_private.oauth_success(token_id,app_id,user_id,client_id,environment,issued_at)
select t.id,c.app_id,t.user_id,t.client_id,c.environment,t.created_at
from public.rocket_oauth_access_tokens t join public.rocket_oauth_clients c on c.client_id=t.client_id
on conflict(token_id) do nothing;

-- The operational transaction may be updated for each subscription renewal.
-- This append-only ledger instead has one row per verified Stripe payment.
create table investor_private.marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  stripe_account_id text not null,
  payment_key text not null,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  transaction_id uuid references public.connect_transactions(id) on delete restrict,
  app_id uuid references app_graph.apps(id) on delete restrict,
  offer_id uuid not null,
  buyer_user_id uuid references auth.users(id) on delete set null,
  merchant_account_id uuid not null,
  livemode boolean not null,
  amount_cents bigint not null check(amount_cents > 0),
  application_fee_cents bigint not null check(application_fee_cents between 0 and amount_cents),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  origin text not null default 'UNKNOWN' check(origin in ('ROCKET_MARKETPLACE','EXTERNAL_BUTTON','UNKNOWN')),
  related_party text not null default 'UNKNOWN' check(related_party in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN')),
  paid_at timestamptz not null,
  source_event_id text,
  reconciliation_status text not null default 'WEBHOOK_VERIFIED' check(reconciliation_status in ('WEBHOOK_VERIFIED','STRIPE_RECONCILED','INCOMPLETE')),
  recorded_at timestamptz not null default now(),
  unique(stripe_account_id,livemode,payment_key)
);
create index marketplace_payments_period on investor_private.marketplace_payments(livemode,paid_at,currency);
create table investor_private.marketplace_adjustments (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references investor_private.marketplace_payments(id) on delete restrict,
  stripe_adjustment_id text not null unique,
  kind text not null check(kind in ('REFUND','DISPUTE','REVERSAL')),
  amount_cents bigint not null check(amount_cents > 0),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table investor_private.marketplace_payments enable row level security;
alter table investor_private.marketplace_adjustments enable row level security;
revoke all on investor_private.marketplace_payments, investor_private.marketplace_adjustments from public, anon, authenticated;
grant select,insert on investor_private.marketplace_payments, investor_private.marketplace_adjustments to service_role;

-- Direct changes to existing financial rows are forbidden. Reconciliation
-- corrections are separate adjustment or audited classification records.
create function investor_private.reject_ledger_change() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Investor ledger is append-only'; end; $$;
create trigger immutable_marketplace_payments before update or delete on investor_private.marketplace_payments
for each row execute function investor_private.reject_ledger_change();
create trigger immutable_marketplace_adjustments before update or delete on investor_private.marketplace_adjustments
for each row execute function investor_private.reject_ledger_change();

create function public.rocket_record_marketplace_payment(
  p_transaction_id uuid,p_payment_key text,p_invoice_id text,p_payment_intent_id text,
  p_amount_cents bigint,p_fee_cents bigint,p_currency text,p_paid_at timestamptz,p_source_event_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t record; v_id uuid; v_mode boolean; v_origin text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select t.*,c.app_id,c.environment,a.id as merchant_id,p.currency as offer_currency,
    p.platform_fee_bps,att.origin as attempt_origin into t
  from public.connect_transactions t
  join public.rocket_oauth_clients c on c.client_id=t.client_id
  join public.connect_developer_accounts a on a.id=t.developer_account_id and a.stripe_account_id=t.stripe_account_id
  join public.connect_products p on p.id=t.product_id and p.client_id=t.client_id
  left join public.connect_checkout_attempts att on att.stripe_checkout_session_id=t.stripe_checkout_session_id
  where t.id=p_transaction_id;
  if t.id is null or t.app_id is null or p_payment_key is null
    or (p_payment_key is distinct from p_invoice_id and p_payment_key is distinct from p_payment_intent_id)
    or p_amount_cents <= 0 or lower(p_currency) <> lower(t.currency) or lower(p_currency) <> lower(t.offer_currency)
    or p_fee_cents <> round(p_amount_cents * t.platform_fee_bps / 10000.0) then
    raise exception 'Unverified marketplace payment';
  end if;
  v_mode := t.environment='production';
  v_origin := coalesce(t.attempt_origin,'UNKNOWN');
  insert into investor_private.marketplace_payments(stripe_account_id,payment_key,stripe_invoice_id,stripe_payment_intent_id,
    transaction_id,app_id,offer_id,buyer_user_id,merchant_account_id,livemode,amount_cents,application_fee_cents,
    currency,origin,paid_at,source_event_id)
  values(t.stripe_account_id,p_payment_key,p_invoice_id,p_payment_intent_id,t.id,t.app_id,t.product_id,t.user_id,t.merchant_id,
    v_mode,p_amount_cents,p_fee_cents,lower(p_currency),v_origin,p_paid_at,p_source_event_id)
  on conflict(stripe_account_id,livemode,payment_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from investor_private.marketplace_payments
      where stripe_account_id=t.stripe_account_id and livemode=v_mode and payment_key=p_payment_key
      and transaction_id=t.id and amount_cents=p_amount_cents and application_fee_cents=p_fee_cents;
  end if;
  if v_id is null then raise exception 'Marketplace ledger conflict'; end if;
  return v_id;
end; $$;
revoke all on function public.rocket_record_marketplace_payment(uuid,text,text,text,bigint,bigint,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.rocket_record_marketplace_payment(uuid,text,text,text,bigint,bigint,text,timestamptz,text) to service_role;

create function public.rocket_record_marketplace_adjustment(p_payment_id uuid,p_adjustment_id text,p_kind text,
  p_amount_cents bigint,p_currency text,p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare p investor_private.marketplace_payments;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into p from investor_private.marketplace_payments where id=p_payment_id;
  if p.id is null or p_kind not in ('REFUND','DISPUTE','REVERSAL') or lower(p_currency)<>p.currency
    or p_amount_cents <= 0 or p_amount_cents > p.amount_cents then raise exception 'Invalid adjustment'; end if;
  insert into investor_private.marketplace_adjustments(payment_id,stripe_adjustment_id,kind,amount_cents,currency,occurred_at)
  values(p_payment_id,p_adjustment_id,p_kind,p_amount_cents,p.currency,p_occurred_at)
  on conflict(stripe_adjustment_id) do nothing;
  if not exists(select 1 from investor_private.marketplace_adjustments where stripe_adjustment_id=p_adjustment_id
    and payment_id=p_payment_id and kind=p_kind and amount_cents=p_amount_cents) then
    raise exception 'Adjustment conflict';
  end if;
end; $$;
revoke all on function public.rocket_record_marketplace_adjustment(uuid,text,text,bigint,text,timestamptz) from public, anon, authenticated;
grant execute on function public.rocket_record_marketplace_adjustment(uuid,text,text,bigint,text,timestamptz) to service_role;

create function public.rocket_record_marketplace_adjustment_by_key(
  p_stripe_account_id text,p_payment_key text,p_adjustment_id text,p_kind text,
  p_amount_cents bigint,p_currency text,p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payment_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select id into v_payment_id from investor_private.marketplace_payments
    where stripe_account_id=p_stripe_account_id and payment_key=p_payment_key;
  if v_payment_id is null then raise exception 'Payment ledger row missing'; end if;
  perform public.rocket_record_marketplace_adjustment(v_payment_id,p_adjustment_id,p_kind,
    p_amount_cents,p_currency,p_occurred_at);
end; $$;
revoke all on function public.rocket_record_marketplace_adjustment_by_key(text,text,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rocket_record_marketplace_adjustment_by_key(text,text,text,text,bigint,text,timestamptz) to service_role;

alter table public.connect_checkout_attempts add column origin text not null default 'UNKNOWN'
  check(origin in ('ROCKET_MARKETPLACE','EXTERNAL_BUTTON','UNKNOWN'));

-- Related-party labels are corrections layered over immutable payments.
create table investor_private.payment_classification (
  payment_id uuid primary key references investor_private.marketplace_payments(id) on delete restrict,
  related_party text not null check(related_party in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN')),
  reason text not null check(length(trim(reason)) >= 10),
  admin_actor uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table investor_private.payment_classification_history (
  id bigint generated always as identity primary key,
  payment_id uuid not null,
  related_party text not null,
  reason text not null,
  admin_actor uuid,
  recorded_at timestamptz not null default now()
);
alter table investor_private.payment_classification enable row level security;
alter table investor_private.payment_classification_history enable row level security;
revoke all on investor_private.payment_classification,investor_private.payment_classification_history from public,anon,authenticated;
create function investor_private.audit_payment_classification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into investor_private.payment_classification_history(payment_id,related_party,reason,admin_actor)
  values(new.payment_id,new.related_party,new.reason,new.admin_actor);
  return new;
end; $$;
create trigger audit_investor_payment_classification after insert or update on investor_private.payment_classification
for each row execute function investor_private.audit_payment_classification();
create function public.rocket_admin_classify_payment(p_payment_id uuid,p_related_party text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_related_party not in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN') or length(trim(coalesce(p_reason,'')))<10
    then raise exception 'Invalid payment classification'; end if;
  insert into investor_private.payment_classification(payment_id,related_party,reason,admin_actor)
  values(p_payment_id,p_related_party,p_reason,auth.uid())
  on conflict(payment_id) do update set related_party=excluded.related_party,reason=excluded.reason,
    admin_actor=excluded.admin_actor,updated_at=now();
end; $$;
revoke all on function public.rocket_admin_classify_payment(uuid,text,text) from public,anon;
grant execute on function public.rocket_admin_classify_payment(uuid,text,text) to authenticated;

create table investor_private.sponsorship_classification (
  sponsorship_id uuid primary key references public.rocket_sponsorships(id) on delete restrict,
  related_party text not null check(related_party in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN')),
  reason text not null,
  admin_actor uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
alter table investor_private.sponsorship_classification enable row level security;
revoke all on investor_private.sponsorship_classification from public,anon,authenticated;
insert into investor_private.sponsorship_classification(sponsorship_id,related_party,reason)
select s.id,'RELATED_PARTY','Founder-funded Featured App production acceptance payment, explicitly identified in 12 October 2026 audit'
from public.rocket_sponsorships s join auth.users u on u.id=s.purchaser_user_id
where lower(u.email)='alex@alexmacgregor.com' and s.sponsorship_type='featured_app'
  and s.stripe_livemode and s.stripe_payment_status='paid' and s.paid_amount_cents=4900;

-- A Stripe payment, its processing cost and its source are a single economic
-- receipt. Entries are added only by a Stripe reconciliation job, never from
-- a subscription entitlement or a browser redirect.
create table investor_private.rocket_revenue_receipts (
  id uuid primary key default gen_random_uuid(),
  stripe_account_id text not null,
  payment_key text not null,
  source text not null check(source in ('DEVELOPER','MARKETPLACE_FEE','FEATURED_APP','CATEGORY_SPONSOR','CREATE')),
  source_record_id text,
  amount_cents bigint not null check(amount_cents > 0),
  processing_cost_cents bigint check(processing_cost_cents >= 0),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  related_party text not null default 'UNKNOWN' check(related_party in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN')),
  paid_at timestamptz not null,
  stripe_balance_transaction_id text,
  reconciliation_status text not null check(reconciliation_status in ('STRIPE_RECONCILED','COST_MISSING','SOURCE_UNMATCHED')),
  reconciled_at timestamptz not null default now(),
  unique(stripe_account_id,payment_key)
);
create table investor_private.rocket_revenue_adjustments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references investor_private.rocket_revenue_receipts(id) on delete restrict,
  stripe_adjustment_id text not null unique,
  kind text not null check(kind in ('REFUND','DISPUTE','REVERSAL','COST')),
  amount_cents bigint not null check(amount_cents > 0),
  currency text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table investor_private.rocket_revenue_receipts enable row level security;
alter table investor_private.rocket_revenue_adjustments enable row level security;
revoke all on investor_private.rocket_revenue_receipts,investor_private.rocket_revenue_adjustments from public,anon,authenticated;
grant select,insert on investor_private.rocket_revenue_receipts,investor_private.rocket_revenue_adjustments to service_role;
create trigger immutable_rocket_revenue_receipts before update or delete on investor_private.rocket_revenue_receipts
for each row execute function investor_private.reject_ledger_change();
create trigger immutable_rocket_revenue_adjustments before update or delete on investor_private.rocket_revenue_adjustments
for each row execute function investor_private.reject_ledger_change();

create table investor_private.revenue_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check(status in ('RUNNING','COMPLETE','FAILED')),
  sponsor_records integer not null default 0,
  developer_records integer not null default 0,
  marketplace_fee_records integer not null default 0,
  error text
);
alter table investor_private.revenue_sync_runs enable row level security;
revoke all on investor_private.revenue_sync_runs from public,anon,authenticated;

create function public.rocket_record_revenue_receipt(
  p_payment_key text,p_source text,p_source_record_id text,p_amount_cents bigint,p_cost_cents bigint,
  p_currency text,p_related_party text,p_paid_at timestamptz,p_balance_transaction_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sponsor public.rocket_sponsorships; v_membership public.rocket_developer_memberships;
  v_marketplace investor_private.marketplace_payments;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_payment_key is null or p_source not in ('DEVELOPER','MARKETPLACE_FEE','FEATURED_APP','CATEGORY_SPONSOR')
    or p_amount_cents <= 0 or p_cost_cents is null or p_cost_cents<0 or p_cost_cents>p_amount_cents
    or lower(p_currency)<>'usd' or p_balance_transaction_id is null
    or p_related_party not in ('INDEPENDENT_CUSTOMER','RELATED_PARTY','UNKNOWN') then
    raise exception 'Unreconciled Rocket revenue';
  end if;
  if p_source in ('FEATURED_APP','CATEGORY_SPONSOR') then
    select * into v_sponsor from public.rocket_sponsorships where id=p_source_record_id::uuid;
    if v_sponsor.id is null or not v_sponsor.stripe_livemode or v_sponsor.stripe_payment_status<>'paid'
      or v_sponsor.paid_amount_cents<>p_amount_cents or v_sponsor.stripe_payment_intent_id<>p_payment_key
      or (p_source='FEATURED_APP')<>(v_sponsor.sponsorship_type='featured_app') then
      raise exception 'Sponsorship receipt mismatch'; end if;
  elsif p_source='MARKETPLACE_FEE' then
    select * into v_marketplace from investor_private.marketplace_payments where id=p_source_record_id::uuid;
    if v_marketplace.id is null or not v_marketplace.livemode
      or v_marketplace.application_fee_cents<>p_amount_cents then
      raise exception 'Marketplace fee mismatch'; end if;
  else
    select * into v_membership from public.rocket_developer_memberships
      where stripe_subscription_id=p_source_record_id;
    if v_membership.user_id is null then raise exception 'Developer subscription mismatch'; end if;
  end if;
  insert into investor_private.rocket_revenue_receipts(stripe_account_id,payment_key,source,source_record_id,
    amount_cents,processing_cost_cents,currency,related_party,paid_at,stripe_balance_transaction_id,reconciliation_status)
  values('acct_1TfvwfL9pkHWyRRu',p_payment_key,p_source,p_source_record_id,p_amount_cents,p_cost_cents,'usd',
    p_related_party,p_paid_at,p_balance_transaction_id,'STRIPE_RECONCILED')
  on conflict(stripe_account_id,payment_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from investor_private.rocket_revenue_receipts where stripe_account_id='acct_1TfvwfL9pkHWyRRu'
      and payment_key=p_payment_key and source=p_source and source_record_id=p_source_record_id
      and amount_cents=p_amount_cents and processing_cost_cents=p_cost_cents and currency='usd';
  end if;
  if v_id is null then raise exception 'Rocket revenue receipt conflict'; end if;
  return v_id;
end; $$;
revoke all on function public.rocket_record_revenue_receipt(text,text,text,bigint,bigint,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.rocket_record_revenue_receipt(text,text,text,bigint,bigint,text,text,timestamptz,text) to service_role;

create function public.rocket_record_revenue_sync(p_status text,p_sponsors integer,p_developers integer,
  p_marketplace_fees integer,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_status not in ('COMPLETE','FAILED') then raise exception 'Invalid sync status'; end if;
  insert into investor_private.revenue_sync_runs(status,completed_at,sponsor_records,developer_records,marketplace_fee_records,error)
    values(p_status,now(),p_sponsors,p_developers,p_marketplace_fees,left(p_error,500));
end; $$;
revoke all on function public.rocket_record_revenue_sync(text,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.rocket_record_revenue_sync(text,integer,integer,integer,text) to service_role;

create function public.rocket_pending_marketplace_fees() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select p.id,p.stripe_account_id,p.stripe_invoice_id,p.stripe_payment_intent_id,
      p.application_fee_cents,p.currency
    from investor_private.marketplace_payments p
    where p.livemode and p.application_fee_cents>0
    order by p.paid_at limit 101
  ) x;
  return v_result;
end; $$;
revoke all on function public.rocket_pending_marketplace_fees() from public,anon,authenticated;
grant execute on function public.rocket_pending_marketplace_fees() to service_role;

create function public.rocket_investor_sponsorship_classification(p_sponsorship_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_result text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select related_party into v_result from investor_private.sponsorship_classification where sponsorship_id=p_sponsorship_id;
  return coalesce(v_result,'UNKNOWN');
end; $$;
revoke all on function public.rocket_investor_sponsorship_classification(uuid) from public,anon,authenticated;
grant execute on function public.rocket_investor_sponsorship_classification(uuid) to service_role;

create table investor_private.daily_snapshots (
  snapshot_date date not null,
  revision integer not null check(revision > 0),
  as_of timestamptz not null,
  metrics jsonb not null,
  calculated_at timestamptz not null default now(),
  primary key(snapshot_date,revision)
);
alter table investor_private.daily_snapshots enable row level security;
revoke all on investor_private.daily_snapshots from public,anon,authenticated;
create index investor_snapshots_recent on investor_private.daily_snapshots(snapshot_date desc,revision desc);

-- Half-open UTC windows [as_of - 30 days, as_of). The latest revision is
-- materialized by cron; the admin RPC reads one bounded snapshot.
create function investor_private.calculate_metrics(p_as_of timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz := p_as_of - interval '30 days';
  v_previous timestamptz := p_as_of - interval '60 days';
  v_connected jsonb; v_cross jsonb; v_gmv jsonb; v_revenue jsonb;
begin
  with qualifying as (
    select e.app_id,e.user_id,e.issued_at from investor_private.oauth_success e
    join public.rocket_oauth_access_tokens t on t.id=e.token_id and t.revoked_at is null
    join public.rocket_oauth_clients c on c.client_id=e.client_id and c.app_id=e.app_id
      and c.environment='production' and c.is_active
    join investor_private.app_classification k on k.app_id=e.app_id
      and k.classification='INDEPENDENT' and k.effective_at<=e.issued_at
    where e.environment='production' and e.user_id is not null and e.issued_at<p_as_of
  ), app_first as (select app_id,min(issued_at) first_at from qualifying group by app_id)
  select jsonb_build_object('total',(select count(*) from app_first),
    'active_30d',(select count(distinct app_id) from qualifying where issued_at>=v_start),
    'new_30d',(select count(*) from app_first where first_at>=v_start),
    'previous_active_30d',(select count(distinct app_id) from qualifying where issued_at>=v_previous and issued_at<v_start),
    'quality','PARTIAL','limitations','Pre-deployment OAuth history lacks atomic canonical success events')
    into v_connected;

  with qualifying as (
    select e.app_id,e.user_id,e.issued_at from investor_private.oauth_success e
    join public.rocket_oauth_access_tokens t on t.id=e.token_id and t.revoked_at is null
    join public.rocket_oauth_clients c on c.client_id=e.client_id and c.app_id=e.app_id
      and c.environment='production' and c.is_active
    join investor_private.app_classification k on k.app_id=e.app_id
      and k.classification='INDEPENDENT' and k.effective_at<=e.issued_at
    where e.environment='production' and e.user_id is not null and e.issued_at<p_as_of
  ), per_app as (select user_id,app_id,min(issued_at) first_at from qualifying group by user_id,app_id),
    second_app as (select user_id,max(first_at) second_at from
      (select user_id,first_at,row_number() over(partition by user_id order by first_at,app_id) ordinal from per_app) x
      where ordinal<=2 group by user_id having count(*)=2)
  select jsonb_build_object('total',(select count(*) from second_app),
    'active_30d',(select count(*) from (select user_id from qualifying where issued_at>=v_start group by user_id having count(distinct app_id)>=2) x),
    'new_30d',(select count(*) from second_app where second_at>=v_start),
    'previous_active_30d',(select count(*) from (select user_id from qualifying where issued_at>=v_previous and issued_at<v_start group by user_id having count(distinct app_id)>=2) x),
    'quality','PARTIAL','limitations','Pre-deployment canonical OAuth success history is incomplete')
    into v_cross;

  select jsonb_build_object('currencies',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb),
    'quality','PARTIAL',
    'limitations','Ledger is webhook-fed; independent Stripe reconciliation, refunds and subscription renewals still need acceptance') into v_gmv
  from (select p.currency,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start),0) gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_previous and p.paid_at<v_start),0) previous_gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_previous and p.paid_at<v_start),0)
        - coalesce((select sum(case when a.kind='REVERSAL' then -a.amount_cents else a.amount_cents end) from investor_private.marketplace_adjustments a
          join investor_private.marketplace_payments pm on pm.id=a.payment_id
          where pm.currency=p.currency and pm.livemode and a.occurred_at>=v_previous and a.occurred_at<v_start),0) previous_net_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start),0)
        - coalesce((select sum(case when a.kind='REVERSAL' then -a.amount_cents else a.amount_cents end) from investor_private.marketplace_adjustments a
          join investor_private.marketplace_payments pm on pm.id=a.payment_id
          where pm.currency=p.currency and pm.livemode and a.occurred_at>=v_start and a.occurred_at<p_as_of),0) net_cents,
      count(*) filter(where p.paid_at>=v_start) completed_payments,
      count(distinct p.app_id) filter(where p.paid_at>=v_start) revenue_apps,
      count(*) filter(where p.paid_at>=v_start and p.origin='ROCKET_MARKETPLACE') rocket_origin_payments,
      count(*) filter(where p.paid_at>=v_start and p.origin='EXTERNAL_BUTTON') external_origin_payments,
      count(*) filter(where p.paid_at>=v_start and p.origin='UNKNOWN') unknown_origin_payments,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start and
        coalesce(pc.related_party,p.related_party)='INDEPENDENT_CUSTOMER'),0) independent_customer_gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start and
        coalesce(pc.related_party,p.related_party)='RELATED_PARTY'),0) related_party_gross_cents
    from investor_private.marketplace_payments p
    join investor_private.app_classification k on k.app_id=p.app_id and k.classification='INDEPENDENT'
      and k.effective_at<=p.paid_at
    left join investor_private.payment_classification pc on pc.payment_id=p.id
    where p.livemode and p.paid_at<p_as_of group by p.currency) x;

  select jsonb_build_object(
    'amount_cents',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      and not exists(select 1 from public.rocket_sponsorships s where s.stripe_livemode and s.stripe_payment_status='paid'
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source_record_id=s.id::text
          and r.source in ('FEATURED_APP','CATEGORY_SPONSOR')))
      and not exists(select 1 from investor_private.marketplace_payments p where p.livemode and p.application_fee_cents>0
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source='MARKETPLACE_FEE'
          and r.source_record_id=p.id::text))
      then coalesce((select sum(r.amount_cents-r.processing_cost_cents) from investor_private.rocket_revenue_receipts r
        where r.currency='usd' and r.paid_at>=v_start and r.paid_at<p_as_of),0) else null end,
    'previous_30d_cents',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      then coalesce((select sum(r.amount_cents-r.processing_cost_cents) from investor_private.rocket_revenue_receipts r
        where r.currency='usd' and r.paid_at>=v_previous and r.paid_at<v_start),0) else null end,
    'currency','usd','quality',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      then 'PARTIAL' else 'UNVERIFIED' end,
    'source_breakdown',jsonb_build_object(
      'developer',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source='DEVELOPER' and paid_at>=v_start and paid_at<p_as_of),0),
      'marketplace_fees',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source='MARKETPLACE_FEE' and paid_at>=v_start and paid_at<p_as_of),0),
      'advertising',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source in ('FEATURED_APP','CATEGORY_SPONSOR') and paid_at>=v_start and paid_at<p_as_of),0)),
    'related_party_cents',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
      where related_party='RELATED_PARTY' and paid_at>=v_start and paid_at<p_as_of),0),
    'independent_customer_cents',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
      where related_party='INDEPENDENT_CUSTOMER' and paid_at>=v_start and paid_at<p_as_of),0),
    'current_30d_gross_advertising_cents',coalesce((select sum(s.paid_amount_cents) from public.rocket_sponsorships s
      where s.stripe_livemode and s.stripe_payment_status='paid' and s.paid_at>=v_start and s.paid_at<p_as_of),0),
    'related_party_gross_advertising_cents',coalesce((select sum(s.paid_amount_cents) from public.rocket_sponsorships s
      join investor_private.sponsorship_classification k on k.sponsorship_id=s.id and k.related_party='RELATED_PARTY'
      where s.stripe_livemode and s.stripe_payment_status='paid' and s.paid_at>=v_start and s.paid_at<p_as_of),0),
    'limitations','Payment-date management metric; Create and separate Launch/Post/Media billing excluded. Refund/dispute reconciliation remains incomplete') into v_revenue;
  return jsonb_build_object('as_of',p_as_of,'window_start',v_start,'previous_window_start',v_previous,
    'connected_apps',v_connected,'cross_app_users',v_cross,'marketplace_gmv',v_gmv,'net_retained_revenue',v_revenue);
end; $$;
revoke all on function investor_private.calculate_metrics(timestamptz) from public,anon,authenticated;

create function investor_private.snapshot_current() returns void
language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := now(); v_date date := (now() at time zone 'UTC')::date;
  v_metrics jsonb; v_latest record;
begin
  v_metrics := investor_private.calculate_metrics(v_now);
  select revision,metrics into v_latest from investor_private.daily_snapshots
    where snapshot_date=v_date order by revision desc limit 1;
  if v_latest.metrics is not distinct from v_metrics then return; end if;
  insert into investor_private.daily_snapshots(snapshot_date,revision,as_of,metrics)
    values(v_date,coalesce(v_latest.revision,0)+1,v_now,v_metrics);
end; $$;
revoke all on function investor_private.snapshot_current() from public,anon,authenticated;
select cron.schedule('rocket-investor-metrics-snapshot','*/15 * * * *','select investor_private.snapshot_current()');
select investor_private.snapshot_current();

create function public.rocket_admin_investor_metrics() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if auth.uid() is null or not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501'; end if;
  select metrics,calculated_at,snapshot_date,revision into s from investor_private.daily_snapshots
    order by snapshot_date desc,revision desc limit 1;
  return coalesce(s.metrics,'{}'::jsonb) || jsonb_build_object('calculated_at',s.calculated_at,
    'snapshot_date',s.snapshot_date,'revision',s.revision,
    'stale',s.calculated_at is null or s.calculated_at<now()-interval '1 hour');
end; $$;
revoke all on function public.rocket_admin_investor_metrics() from public,anon;
grant execute on function public.rocket_admin_investor_metrics() to authenticated;

create function public.rocket_refresh_investor_snapshot() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  perform investor_private.snapshot_current();
end; $$;
revoke all on function public.rocket_refresh_investor_snapshot() from public,anon,authenticated;
grant execute on function public.rocket_refresh_investor_snapshot() to service_role;

select cron.schedule('rocket-investor-revenue-sync','10 4 * * *',
  $$select net.http_post(
    url := 'https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-investor-sync',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-rocket-investor-sync',(select decrypted_secret from vault.decrypted_secrets where name='rocket_posthog_sync_secret')),
    body := '{}'::jsonb,timeout_milliseconds := 30000
  );$$);
