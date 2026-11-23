-- Private, owner-scoped valuation history. A result is a self-reported estimate,
-- never a provider-verified or public financial record.
create table public.rocket_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid null references app_graph.apps(id) on delete set null,
  inputs jsonb not null,
  result jsonb not null,
  currency text not null check (currency in ('USD','EUR','GBP')),
  low_amount numeric(16,2),
  central_amount numeric(16,2),
  high_amount numeric(16,2),
  confidence text not null check (confidence in ('low','medium','high')),
  model_version text not null,
  data_sources text[] not null default array['manual']::text[],
  verification_status text not null default 'manual' check (verification_status = 'manual'),
  calculated_at timestamptz not null default now(),
  constraint valuation_range_order check (
    (low_amount is null and central_amount is null and high_amount is null)
    or (low_amount >= 0 and low_amount <= central_amount and central_amount <= high_amount)
  ),
  constraint valuation_manual_source check (data_sources = array['manual']::text[]),
  constraint valuation_unverified_result check ((result->'evidence' = '{"stripe":false,"ga4":false}'::jsonb) is true),
  constraint valuation_payload_size check (octet_length(inputs::text) <= 16000 and octet_length(result::text) <= 32000)
);

create index rocket_valuations_user_history_idx on public.rocket_valuations(user_id, calculated_at desc);
alter table public.rocket_valuations enable row level security;

create policy "valuation_owner_read" on public.rocket_valuations for select to authenticated
  using (user_id = (select auth.uid()));
create policy "valuation_owner_insert" on public.rocket_valuations for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (app_id is null or exists (
      select 1 from public.app_owners owner
      where owner.app_id = rocket_valuations.app_id
        and owner.user_id = (select auth.uid())
        and owner.revoked_at is null
    ))
  );
create policy "valuation_owner_delete" on public.rocket_valuations for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.rocket_valuations from anon;
grant select, insert, delete on public.rocket_valuations to authenticated;

create function public.limit_rocket_valuation_saves() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  new.calculated_at := pg_catalog.now();
  if (select count(*) from public.rocket_valuations
      where user_id = new.user_id and calculated_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception 'Valuation save limit reached';
  end if;
  return new;
end;
$$;
create trigger limit_rocket_valuation_saves before insert on public.rocket_valuations
  for each row execute function public.limit_rocket_valuation_saves();
