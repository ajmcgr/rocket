-- An OAuth authorization is recorded separately from the current merchant.
-- The owner must explicitly activate the selected account after reviewing it.
create table public.connect_merchant_oauth_attempts (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  developer_user_id uuid not null references auth.users(id) on delete restrict,
  state_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  authorized_at timestamptz,
  stripe_account_id text,
  stripe_account_name text,
  stripe_account_country text,
  charges_enabled boolean,
  payouts_enabled boolean,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create index connect_merchant_oauth_attempts_owner_idx
  on public.connect_merchant_oauth_attempts(client_id, developer_user_id, authorized_at desc);
alter table public.connect_merchant_oauth_attempts enable row level security;
revoke all on public.connect_merchant_oauth_attempts from public, anon, authenticated;
grant all on public.connect_merchant_oauth_attempts to service_role;

-- Only a service-role call, after fresh Stripe and ownership checks, may make
-- the selected OAuth account current. Financial rows remain attached to their
-- original merchant. Open checkout and ongoing subscriptions block a switch.
create function public.connect_activate_oauth_merchant(
  target_attempt_id uuid,
  target_client_id text,
  target_app_id uuid,
  target_developer_user_id uuid,
  target_stripe_account_id text,
  target_charges_enabled boolean,
  target_payouts_enabled boolean
)
returns public.connect_developer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.connect_merchant_oauth_attempts;
  prior public.connect_developer_accounts;
  already public.connect_developer_accounts;
  saved public.connect_developer_accounts;
begin
  perform pg_advisory_xact_lock(hashtext(target_client_id));

  select * into attempt from public.connect_merchant_oauth_attempts
  where id = target_attempt_id for update;
  if not found or attempt.client_id <> target_client_id
    or attempt.app_id <> target_app_id
    or attempt.developer_user_id <> target_developer_user_id
    or attempt.stripe_account_id <> target_stripe_account_id
    or attempt.authorized_at is null
    or attempt.authorized_at < now() - interval '24 hours'
    or attempt.activated_at is not null then
    raise exception 'oauth_account_selection_invalid';
  end if;

  if not coalesce(target_charges_enabled, false)
    or not coalesce(target_payouts_enabled, false) then
    raise exception 'merchant_onboarding_incomplete';
  end if;

  if not exists (
    select 1 from public.rocket_oauth_clients c
    where c.client_id = target_client_id
      and c.app_id = target_app_id
      and c.created_by = target_developer_user_id
      and c.environment = 'production'
      and c.is_active
  ) or not public.can_monetize_rocket_app(target_developer_user_id, target_app_id) then
    raise exception 'merchant_owner_not_permitted';
  end if;

  if not exists (
    select 1 from public.rocket_buy_configuration
    where singleton = true and live_checkout_enabled = false
  ) then
    raise exception 'merchant_switch_requires_checkout_disabled';
  end if;

  select * into prior from public.connect_developer_accounts
  where client_id = target_client_id and is_current for update;

  if prior.id is not null and prior.stripe_account_id <> target_stripe_account_id then
    if exists (
      select 1 from public.connect_checkout_attempts a
      where a.client_id = target_client_id
        and a.stripe_account_id = prior.stripe_account_id
        and a.expires_at > now()
        and a.stripe_checkout_session_id is not null
    ) or exists (
      select 1 from public.connect_transactions t
      where t.client_id = target_client_id
        and t.stripe_account_id = prior.stripe_account_id
        and t.stripe_subscription_id is not null
        and t.status in ('pending', 'paid', 'canceling', 'past_due')
    ) then
      raise exception 'merchant_switch_has_active_payment_state';
    end if;
  end if;

  select * into already from public.connect_developer_accounts
  where stripe_account_id = target_stripe_account_id for update;
  if already.id is not null and
    (already.client_id <> target_client_id or already.developer_user_id <> target_developer_user_id) then
    raise exception 'stripe_account_already_bound';
  end if;

  if prior.id is not null and prior.stripe_account_id <> target_stripe_account_id then
    update public.connect_products set is_active = false, updated_at = now()
    where developer_account_id = prior.id and is_active;
    update public.connect_developer_accounts
    set is_current = false, status = 'disabled', updated_at = now()
    where id = prior.id;
  end if;

  if already.id is null then
    insert into public.connect_developer_accounts (
      client_id, developer_user_id, stripe_account_id, status,
      charges_enabled, payouts_enabled, is_current, stripe_api_version,
      account_configuration, updated_at
    ) values (
      target_client_id, target_developer_user_id, target_stripe_account_id,
      'active', true, true, true, 'v1',
      jsonb_build_object('connection_method', 'oauth', 'account_type', 'standard'), now()
    ) returning * into saved;
  else
    update public.connect_developer_accounts
    set is_current = true, status = 'active', charges_enabled = true,
      payouts_enabled = true, stripe_api_version = 'v1',
      account_configuration = jsonb_build_object('connection_method', 'oauth', 'account_type', 'standard'),
      updated_at = now()
    where id = already.id returning * into saved;
  end if;

  update public.connect_merchant_oauth_attempts
  set activated_at = now() where id = target_attempt_id;
  return saved;
end;
$$;

revoke all on function public.connect_activate_oauth_merchant(uuid, text, uuid, uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.connect_activate_oauth_merchant(uuid, text, uuid, uuid, text, boolean, boolean)
  to service_role;
