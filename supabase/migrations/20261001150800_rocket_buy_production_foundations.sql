-- Production Buy with Rocket reuses the isolated Connect ledger. Historical
-- test accounts, products, subscriptions and Rocket Create billing stay put.
alter table public.connect_products
  drop constraint if exists connect_products_interval_check;
alter table public.connect_products
  add constraint connect_products_interval_check check (interval in ('month', 'year'));

alter table public.connect_products
  add column if not exists integration_confirmed_at timestamptz,
  add column if not exists activated_at timestamptz;

-- The published and server-enforced commercial rate is 10%. Centralize the
-- rate for *new* plans; never rewrite fees on historical transactions.
create table if not exists public.rocket_buy_configuration (
  singleton boolean primary key default true check (singleton),
  platform_fee_bps integer not null check (platform_fee_bps between 0 and 10000),
  live_checkout_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.rocket_buy_configuration (singleton, platform_fee_bps)
values (true, 1000) on conflict (singleton) do nothing;
alter table public.rocket_buy_configuration enable row level security;
revoke all on public.rocket_buy_configuration from anon, authenticated;
grant all on public.rocket_buy_configuration to service_role;

create index if not exists connect_entitlements_library_idx
  on public.connect_entitlements (user_id, updated_at desc);

create index if not exists connect_products_production_active_idx
  on public.connect_products (client_id, activated_at)
  where is_active = true;

-- One currently advertised offer per OAuth app; historical inactive plans
-- and transactions are retained for audit and customer lifecycle management.
create unique index if not exists connect_products_one_active_client_idx
  on public.connect_products (client_id)
  where is_active = true;
