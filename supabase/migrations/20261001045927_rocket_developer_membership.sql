-- Rocket Developer is a separate account-level subscription. It must never
-- overwrite the existing Create-plan subscription or credit balance.
-- Stripe webhooks, not browser state, are the only writer of this table.
create table public.rocket_billing_prices (
  product_code text primary key check (product_code = 'rocket_developer'),
  stripe_product_id text not null unique check (stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
  stripe_price_id text not null unique check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  updated_at timestamptz not null default now()
);

-- Verified in the Rocket LIVE Stripe account on 2026-10-01. The existing
-- Growth product/price is not changed or reused.
insert into public.rocket_billing_prices(product_code, stripe_product_id, stripe_price_id)
values ('rocket_developer', 'prod_VMLDy1MtXAo2C2', 'price_1ULcXKL9pkHWyRRuDKaE6jQk');

create table public.rocket_developer_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  )),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  stripe_event_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  check (stripe_price_id ~ '^price_[A-Za-z0-9]+$')
);

create index rocket_developer_memberships_customer_idx
  on public.rocket_developer_memberships (stripe_customer_id);

alter table public.rocket_developer_memberships enable row level security;
create table public.rocket_developer_webhook_events (
  event_id text primary key,
  subscription_id text not null,
  processed_at timestamptz not null default now()
);

alter table public.rocket_billing_prices enable row level security;
alter table public.rocket_developer_webhook_events enable row level security;
revoke all on public.rocket_billing_prices, public.rocket_developer_memberships,
  public.rocket_developer_webhook_events from public, anon, authenticated;
grant all on public.rocket_billing_prices, public.rocket_developer_memberships,
  public.rocket_developer_webhook_events to service_role;

-- One transaction handles replay, event ordering, and the current membership.
-- An older canceled subscription can never displace a newer subscription.
create function public.apply_rocket_developer_subscription_event(
  p_event_id text, p_user_id uuid, p_customer_id text,
  p_subscription_id text, p_price_id text, p_status text,
  p_period_end timestamptz, p_cancel_at_period_end boolean,
  p_event_created_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_rows integer;
begin
  if p_user_id is null or p_period_end is null or p_event_created_at is null
    or p_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused')
    or not exists (
      select 1 from public.rocket_billing_prices
      where product_code = 'rocket_developer' and stripe_price_id = p_price_id
    ) then
    raise exception 'Invalid Rocket Developer billing event';
  end if;

  insert into public.rocket_developer_webhook_events(event_id, subscription_id)
  values (p_event_id, p_subscription_id)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  insert into public.rocket_developer_memberships (
    user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
    status, current_period_end, cancel_at_period_end, stripe_event_created_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_price_id,
    p_status, p_period_end, p_cancel_at_period_end, p_event_created_at
  ) on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_event_created_at = excluded.stripe_event_created_at,
    updated_at = now()
  where excluded.stripe_event_created_at >= public.rocket_developer_memberships.stripe_event_created_at
    and (
      excluded.stripe_subscription_id = public.rocket_developer_memberships.stripe_subscription_id
      or public.rocket_developer_memberships.status <> 'active'
      or public.rocket_developer_memberships.current_period_end <= now()
    );
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.apply_rocket_developer_subscription_event(
  text, uuid, text, text, text, text, timestamptz, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_rocket_developer_subscription_event(
  text, uuid, text, text, text, text, timestamptz, boolean, timestamptz
) to service_role;

-- This predicate is for trusted server code only. Requiring both an active
-- paid period and a non-revoked ownership claim prevents account-level
-- membership from enabling another developer's app.
create function public.can_monetize_rocket_app(p_user_id uuid, p_app_id uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.rocket_developer_memberships m
    join public.app_owners o on o.user_id = m.user_id
    where m.user_id = p_user_id
      and o.app_id = p_app_id
      and o.revoked_at is null
      and o.verification_level in ('claimed', 'domain_verified')
      and m.status = 'active'
      and m.current_period_end > now()
  );
$$;

revoke all on function public.can_monetize_rocket_app(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.can_monetize_rocket_app(uuid, uuid)
  to service_role;
