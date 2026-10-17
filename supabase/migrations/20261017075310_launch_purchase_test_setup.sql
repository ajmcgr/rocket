-- Private owner-selected test configuration. No checkout, grant, or activation is created here.
create table public.rocket_buy_acceptance_tests (
  client_id text primary key references public.rocket_oauth_clients(client_id),
  plan_id uuid not null references public.connect_products(id),
  tester_user_id uuid not null references auth.users(id),
  configured_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (tester_user_id <> configured_by)
);
alter table public.rocket_buy_acceptance_tests enable row level security;
revoke all on public.rocket_buy_acceptance_tests from public, anon, authenticated;
grant select, insert on public.rocket_buy_acceptance_tests to service_role;
