-- Isolated Phase 2 proof. These objects deliberately do not share Rocket's
-- subscriptions, payments, credit, checkout, or webhook tables.
create table public.connect_developer_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique references public.rocket_oauth_clients(client_id) on delete restrict,
  stripe_account_id text not null unique,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connect_products (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  developer_account_id uuid not null references public.connect_developer_accounts(id) on delete restrict,
  product_key text not null check (product_key ~ '^[a-z0-9][a-z0-9_-]{2,80}$'),
  name text not null,
  stripe_product_id text not null,
  stripe_price_id text not null unique,
  amount_cents integer not null check (amount_cents = 1000),
  currency text not null check (currency = 'usd'),
  interval text not null check (interval = 'month'),
  platform_fee_bps integer not null check (platform_fee_bps = 1000),
  is_active boolean not null default false,
  checkout_return_uris text[] not null check (cardinality(checkout_return_uris) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, product_key)
);

create table public.connect_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  developer_account_id uuid not null references public.connect_developer_accounts(id) on delete restrict,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  unique(user_id, developer_account_id),
  unique(developer_account_id, stripe_customer_id)
);

create table public.connect_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  product_id uuid not null references public.connect_products(id) on delete restrict,
  stripe_account_id text not null,
  idempotency_key text not null unique,
  stripe_checkout_session_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.connect_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  product_id uuid not null references public.connect_products(id) on delete restrict,
  developer_account_id uuid not null references public.connect_developer_accounts(id) on delete restrict,
  stripe_account_id text not null,
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  amount_cents integer not null,
  application_fee_cents integer not null,
  currency text not null,
  status text not null check (status in ('pending','paid','canceling','past_due','refunded','disputed','expired','failed')),
  stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connect_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete restrict,
  product_id uuid not null references public.connect_products(id) on delete restrict,
  transaction_id uuid references public.connect_transactions(id) on delete set null,
  status text not null check (status in ('active','canceling','past_due','refunded','revoked','disputed','expired','suspended')),
  valid_from timestamptz,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_id, product_id)
);

create table public.connect_entitlement_events (
  id bigint generated always as identity primary key,
  entitlement_id uuid not null references public.connect_entitlements(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.connect_webhook_events (
  event_id text primary key,
  stripe_account_id text not null,
  event_type text not null,
  event_created_at timestamptz not null,
  processing_result text not null check (processing_result in ('applied','stale','failed')),
  detail jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index connect_products_client_active_idx on public.connect_products(client_id, is_active);
create index connect_entitlements_lookup_idx on public.connect_entitlements(user_id, client_id, status);
create index connect_transactions_subscription_idx on public.connect_transactions(stripe_account_id, stripe_subscription_id);

alter table public.connect_developer_accounts enable row level security;
alter table public.connect_products enable row level security;
alter table public.connect_customers enable row level security;
alter table public.connect_checkout_attempts enable row level security;
alter table public.connect_transactions enable row level security;
alter table public.connect_entitlements enable row level security;
alter table public.connect_entitlement_events enable row level security;
alter table public.connect_webhook_events enable row level security;

revoke all on public.connect_developer_accounts, public.connect_products,
  public.connect_customers, public.connect_checkout_attempts, public.connect_transactions,
  public.connect_entitlements, public.connect_entitlement_events, public.connect_webhook_events
  from anon, authenticated;
grant all on public.connect_developer_accounts, public.connect_products,
  public.connect_customers, public.connect_checkout_attempts, public.connect_transactions,
  public.connect_entitlements, public.connect_entitlement_events, public.connect_webhook_events
  to service_role;

-- The independent proof client receives a fresh consent request when it asks
-- for entitlement data. Payment initiation itself is bound to the authenticated
-- user and the client-bound access token; it gets no ambient payment scope.
update public.rocket_oauth_clients
set allowed_scopes = array['openid','profile','email','entitlements:read']::text[], updated_at = now()
where client_id = 'rocket-connect-test-web';
