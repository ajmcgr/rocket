-- Reserves and records account-originated Beehiiv subscriptions so concurrent
-- tabs cannot submit the same account twice. Only the Edge Function uses this.
create table if not exists public.beehiiv_account_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subscription_id text,
  beehiiv_status text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.beehiiv_account_sync enable row level security;
revoke all on public.beehiiv_account_sync from public, anon, authenticated;
grant select, insert, update, delete on public.beehiiv_account_sync to service_role;
