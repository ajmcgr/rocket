-- Accounts v2 is additive. Existing Connect proof accounts and their payment
-- evidence remain immutable history; each client/developer pair can have one
-- account designated current for new checkout and product operations.
alter table public.connect_developer_accounts
  add column if not exists is_current boolean not null default true,
  add column if not exists stripe_api_version text not null default 'v1'
    check (stripe_api_version in ('v1', 'v2')),
  add column if not exists account_configuration jsonb not null default '{}'::jsonb;

-- The original Phase 2 proof used a single-account unique constraint on
-- client_id. Remove that restriction only after
-- preserving all existing rows as history below.
alter table public.connect_developer_accounts
  drop constraint if exists connect_developer_accounts_client_id_key;

-- All pre-Accounts-v2 rows are retained as v1 history. They remain current
-- until a developer deliberately starts the new v2 onboarding flow.
update public.connect_developer_accounts
set stripe_api_version = 'v1', is_current = true
where stripe_api_version is distinct from 'v1' or is_current is distinct from true;

create unique index if not exists connect_developer_accounts_one_current_idx
  on public.connect_developer_accounts(client_id)
  where is_current;

create index if not exists connect_developer_accounts_current_lookup_idx
  on public.connect_developer_accounts(client_id, developer_user_id, created_at desc)
  where is_current;

-- Atomically retire a developer's prior current account and its active
-- products before making the freshly-created v2 merchant account current.
-- This function is service-role-only; browser clients cannot select or invoke
-- any Connect payment tables directly.
create or replace function public.connect_set_current_developer_account(
  target_client_id text,
  target_developer_user_id uuid,
  target_stripe_account_id text,
  target_configuration jsonb
)
returns public.connect_developer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.connect_developer_accounts;
begin
  update public.connect_products p
  set is_active = false, updated_at = now()
  from public.connect_developer_accounts a
  where p.developer_account_id = a.id
    and a.client_id = target_client_id
    and a.is_current
    and a.stripe_account_id <> target_stripe_account_id;

  update public.connect_developer_accounts
  set is_current = false, status = 'disabled', updated_at = now()
  where client_id = target_client_id
    and is_current
    and stripe_account_id <> target_stripe_account_id;

  insert into public.connect_developer_accounts (
    client_id, developer_user_id, stripe_account_id, status,
    charges_enabled, payouts_enabled, is_current, stripe_api_version,
    account_configuration, updated_at
  ) values (
    target_client_id, target_developer_user_id, target_stripe_account_id,
    'pending', false, false, true, 'v2', target_configuration, now()
  )
  on conflict (stripe_account_id) do update set
    client_id = excluded.client_id,
    developer_user_id = excluded.developer_user_id,
    status = 'pending',
    charges_enabled = false,
    payouts_enabled = false,
    is_current = true,
    stripe_api_version = 'v2',
    account_configuration = excluded.account_configuration,
    updated_at = now()
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.connect_set_current_developer_account(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.connect_set_current_developer_account(text, uuid, text, jsonb) to service_role;
