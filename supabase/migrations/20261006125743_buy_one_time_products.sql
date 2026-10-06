-- Existing rows remain subscriptions; no historical product or rate rewrite.
alter table public.connect_products add column billing_type text not null default 'subscription'
  check (billing_type in ('subscription','one_time'));
alter table public.connect_products alter column interval drop not null;
alter table public.connect_products drop constraint connect_products_interval_check;
alter table public.connect_products add constraint connect_products_interval_check check (
  (billing_type='subscription' and interval is not null and interval in ('month','year')) or
  (billing_type='one_time' and interval is null)
);

-- Consumable units must not overwrite the single subscription entitlement.
create unique index connect_one_time_payment_intent_unique on public.connect_transactions(stripe_account_id,stripe_payment_intent_id)
  where stripe_subscription_id is null and stripe_payment_intent_id is not null;
create table public.connect_purchase_grants (
  purchase_id uuid primary key references public.connect_transactions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  product_id uuid not null references public.connect_products(id) on delete restrict,
  quantity integer not null default 1 check (quantity=1),
  status text not null check (status in ('granted','refunded','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index connect_purchase_grants_user_client_idx on public.connect_purchase_grants(user_id,client_id,created_at);
alter table public.connect_purchase_grants enable row level security;
revoke all on public.connect_purchase_grants from public,anon,authenticated;
grant all on public.connect_purchase_grants to service_role;

-- Invoker, service-role-only, atomic and row-locked. Verified webhook is the
-- sole writer. Conflicting deliveries cannot create a second unit or resurrect
-- revoked access. The merchant must UNIQUE(client_id,purchase_id) on fulfilment.
create function public.connect_settle_one_time(p_transaction_id uuid,p_environment text,p_status text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.connect_transactions; p public.connect_products; a public.connect_developer_accounts; c public.rocket_oauth_clients;
begin
  if p_status is null or p_environment is null or p_status not in ('granted','refunded','disputed') or p_environment not in ('production','test') then raise exception 'invalid settlement'; end if;
  select * into strict t from public.connect_transactions where id=p_transaction_id for update;
  select * into strict p from public.connect_products where id=t.product_id;
  select * into strict a from public.connect_developer_accounts where id=t.developer_account_id;
  select * into strict c from public.rocket_oauth_clients where client_id=t.client_id;
  if p.billing_type<>'one_time' or c.environment<>p_environment or p.client_id<>t.client_id or
    a.client_id<>t.client_id or p.developer_account_id<>a.id or a.stripe_account_id<>t.stripe_account_id or
    t.stripe_subscription_id is not null or t.stripe_payment_intent_id is null or
    t.amount_cents<>p.amount_cents or t.currency<>p.currency then raise exception 'purchase isolation mismatch'; end if;
  if p_status='granted' and t.status in ('refunded','disputed','expired','failed') then return t.id; end if;
  update public.connect_transactions set status=case when p_status='granted' then 'paid' else p_status end,updated_at=now() where id=t.id;
  insert into public.connect_purchase_grants(purchase_id,user_id,client_id,product_id,status)
    values(t.id,t.user_id,t.client_id,t.product_id,p_status)
    on conflict(purchase_id) do update set status=case when connect_purchase_grants.status<>'granted' then connect_purchase_grants.status else excluded.status end,updated_at=now();
  return t.id;
end $$;
revoke all on function public.connect_settle_one_time(uuid,text,text) from public,anon,authenticated;
grant execute on function public.connect_settle_one_time(uuid,text,text) to service_role;
