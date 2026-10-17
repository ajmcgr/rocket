-- Additive offer grouping; existing offer IDs, keys and ledger rows are retained.
alter table public.rocket_buy_configuration add column multi_plan_enabled boolean not null default false;
alter table public.connect_products add column description text not null default '' check (length(description)<=500);
alter table public.connect_products add column entitlement_key text;
update public.connect_products set entitlement_key=product_key where entitlement_key is null;
alter table public.connect_products alter column entitlement_key set not null;
alter table public.connect_products add constraint connect_products_entitlement_key_check check(entitlement_key ~ '^[a-z0-9][a-z0-9_-]{2,80}$');
drop index public.connect_products_one_active_client_idx;
create index connect_products_entitlement_idx on public.connect_products(client_id,entitlement_key);

-- Serialize publication, including concurrent requests. Never rebind a sold offer.
create function public.connect_guard_offer() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.entitlement_key := coalesce(new.entitlement_key,new.product_key);
  perform pg_advisory_xact_lock(hashtextextended(new.client_id, 9817));
  if TG_OP='UPDATE' then
    if (new.client_id,new.developer_account_id,new.developer_user_id,new.product_key,new.stripe_price_id,new.stripe_product_id,new.amount_cents,new.currency,new.interval,new.billing_type,new.platform_fee_bps)
      is distinct from (old.client_id,old.developer_account_id,old.developer_user_id,old.product_key,old.stripe_price_id,old.stripe_product_id,old.amount_cents,old.currency,old.interval,old.billing_type,old.platform_fee_bps) then
      raise exception 'offer_payment_identity_immutable';
    end if;
    if new.entitlement_key is distinct from old.entitlement_key and
      (exists(select 1 from connect_checkout_attempts where product_id=old.id) or exists(select 1 from connect_transactions where product_id=old.id)) then
      raise exception 'purchased_entitlement_immutable';
    end if;
  end if;
  if new.is_active then
    if not (select multi_plan_enabled from rocket_buy_configuration where singleton) and
      exists(select 1 from connect_products where client_id=new.client_id and is_active and id<>new.id) then
      raise exception 'multi_plan_not_enabled';
    end if;
    if exists(select 1 from connect_products where client_id=new.client_id and developer_account_id=new.developer_account_id and
      entitlement_key=new.entitlement_key and is_active and id<>new.id and
      (interval is not distinct from new.interval or currency<>new.currency or billing_type<>new.billing_type)) then
      raise exception 'ambiguous_plan_group';
    end if;
  end if;
  return new;
end $$;
create trigger connect_offer_guard before insert or update on public.connect_products for each row execute function public.connect_guard_offer();
revoke all on function public.connect_guard_offer() from public,anon,authenticated;

-- A persistent app/buyer reservation spans the Stripe HTTP request. Time alone
-- NEVER releases it: only authoritative expired Stripe checkout permits release.
create table public.connect_subscription_checkouts (
  user_id uuid not null references auth.users(id), client_id text not null references public.rocket_oauth_clients(client_id),
  product_id uuid not null references public.connect_products(id), stripe_account_id text not null,
  idempotency_key uuid not null default gen_random_uuid(), expires_at timestamptz not null default(now()+interval '31 minutes'),
  stripe_checkout_session_id text, origin text not null check(origin in ('ROCKET_MARKETPLACE','EXTERNAL_BUTTON')),
  created_at timestamptz not null default now(), primary key(user_id,client_id)
);
alter table public.connect_subscription_checkouts enable row level security;
revoke all on public.connect_subscription_checkouts from public,anon,authenticated;
grant all on public.connect_subscription_checkouts to service_role;
create index connect_subscription_checkout_client_idx on public.connect_subscription_checkouts(client_id);
create index connect_subscription_checkout_product_idx on public.connect_subscription_checkouts(product_id);
create function public.connect_reserve_subscription(p_user_id uuid,p_client_id text,p_product_id uuid,p_account text,p_origin text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r connect_subscription_checkouts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_client_id,19817));
  if not exists(select 1 from connect_products p join connect_developer_accounts a on a.id=p.developer_account_id
    join rocket_oauth_clients c on c.client_id=p.client_id where p.id=p_product_id and p.client_id=p_client_id
    and p.billing_type='subscription' and p.is_active and p.activated_at is not null and p.platform_fee_bps=500
    and a.stripe_account_id=p_account and a.is_current and a.developer_user_id=c.created_by and p.developer_user_id=c.created_by
    and c.environment='production' and c.is_active and can_monetize_rocket_app(c.created_by,c.app_id)) then
    raise exception 'offer_not_published';
  end if;
  insert into connect_subscription_checkouts(user_id,client_id,product_id,stripe_account_id,origin)
    values(p_user_id,p_client_id,p_product_id,p_account,p_origin) on conflict(user_id,client_id) do nothing;
  select * into r from connect_subscription_checkouts where user_id=p_user_id and client_id=p_client_id;
  return to_jsonb(r);
end $$;
revoke all on function public.connect_reserve_subscription(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.connect_reserve_subscription(uuid,text,uuid,text,text) to service_role;

-- Analytics is derived from the existing authoritative transaction/entitlement
-- event ledger; no browser return can create a purchase or a GMV record.
