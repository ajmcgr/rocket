-- Rocket Connect: a deliberately small OAuth 2.1 / OIDC provider layer.
-- It is independent of Rocket's existing Supabase Auth sessions.

create table if not exists public.rocket_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique check (client_id ~ '^[a-zA-Z0-9._-]{3,120}$'),
  name text not null check (char_length(name) between 1 and 120),
  icon_url text,
  redirect_uris text[] not null check (cardinality(redirect_uris) > 0),
  allowed_scopes text[] not null default array['openid','profile','email']::text[],
  client_type text not null default 'public' check (client_type in ('public', 'confidential')),
  client_secret_hash text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((client_type = 'public' and client_secret_hash is null) or (client_type = 'confidential' and client_secret_hash is not null))
);

create table if not exists public.rocket_oauth_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete cascade,
  scopes text[] not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, client_id)
);

create table if not exists public.rocket_oauth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  authorization_id uuid not null references public.rocket_oauth_authorizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null,
  code_challenge text not null,
  nonce text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rocket_oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  authorization_id uuid not null references public.rocket_oauth_authorizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.rocket_oauth_clients(client_id) on delete cascade,
  scopes text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rocket_oauth_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  client_id text,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rocket_oauth_authorizations_user_idx on public.rocket_oauth_authorizations(user_id, revoked_at);
create index if not exists rocket_oauth_codes_expires_idx on public.rocket_oauth_codes(expires_at) where consumed_at is null;
create index if not exists rocket_oauth_tokens_lookup_idx on public.rocket_oauth_access_tokens(token_hash) where revoked_at is null;

alter table public.rocket_oauth_clients enable row level security;
alter table public.rocket_oauth_authorizations enable row level security;
alter table public.rocket_oauth_codes enable row level security;
alter table public.rocket_oauth_access_tokens enable row level security;
alter table public.rocket_oauth_events enable row level security;

revoke all on public.rocket_oauth_clients, public.rocket_oauth_authorizations,
  public.rocket_oauth_codes, public.rocket_oauth_access_tokens, public.rocket_oauth_events
  from anon, authenticated;
grant all on public.rocket_oauth_clients, public.rocket_oauth_authorizations,
  public.rocket_oauth_codes, public.rocket_oauth_access_tokens, public.rocket_oauth_events
  to service_role;

-- The only client seeded in Phase 1 is an independent local proof client.
-- Its loopback redirects are exact values; arbitrary localhost ports are rejected.
insert into public.rocket_oauth_clients (client_id, name, redirect_uris, allowed_scopes, client_type)
values (
  'rocket-connect-test-web',
  'Rocket Connect Test App',
  array['http://localhost:3001/callback', 'http://127.0.0.1:3001/callback'],
  array['openid','profile','email'],
  'public'
) on conflict (client_id) do nothing;

