-- Phase 3 is intentionally invitation-only. These records are never exposed
-- through the Data API: the developer portal uses authenticated Edge Functions
-- which apply ownership checks before using the service role.
create table public.connect_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.connect_developer_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.connect_developer_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(email)),
  check ((accepted_at is null) = (accepted_by is null))
);

create unique index connect_developer_open_invitation_email_idx
  on public.connect_developer_invitations(email)
  where accepted_at is null;

-- This is the one-time, audited bootstrap for Rocket's existing operator.
-- All later developer invitations are issued in the protected Rocket UI.
insert into public.connect_developer_operators (user_id)
values ('83c3b5f2-7b51-457f-acf6-a99901f9347f')
on conflict (user_id) do nothing;

alter table public.connect_developer_accounts
  add column if not exists developer_user_id uuid references auth.users(id) on delete restrict;

alter table public.rocket_oauth_clients
  add column if not exists checkout_return_uris text[] not null default array[]::text[];

alter table public.connect_products
  add column if not exists developer_user_id uuid references auth.users(id) on delete restrict;

-- Phase 2's single $10 price remains valid. Phase 3 lets each invited
-- developer register one conventional test subscription, still USD/month and
-- always with Rocket's fixed 10% fee.
alter table public.connect_products
  drop constraint if exists connect_products_amount_cents_check,
  add constraint connect_products_amount_cents_check check (amount_cents between 100 and 100000),
  drop constraint if exists connect_products_currency_check,
  add constraint connect_products_currency_check check (currency = 'usd'),
  drop constraint if exists connect_products_interval_check,
  add constraint connect_products_interval_check check (interval = 'month'),
  drop constraint if exists connect_products_platform_fee_bps_check,
  add constraint connect_products_platform_fee_bps_check check (platform_fee_bps = 1000);

create index if not exists rocket_oauth_clients_owner_idx
  on public.rocket_oauth_clients(created_by, created_at desc)
  where created_by is not null;
create index if not exists connect_developer_accounts_owner_idx
  on public.connect_developer_accounts(developer_user_id, client_id)
  where developer_user_id is not null;
create index if not exists connect_products_owner_idx
  on public.connect_products(developer_user_id, client_id, created_at desc)
  where developer_user_id is not null;

alter table public.connect_developers enable row level security;
alter table public.connect_developer_operators enable row level security;
alter table public.connect_developer_invitations enable row level security;

revoke all on public.connect_developers, public.connect_developer_operators,
  public.connect_developer_invitations from anon, authenticated;
grant all on public.connect_developers, public.connect_developer_operators,
  public.connect_developer_invitations to service_role;
