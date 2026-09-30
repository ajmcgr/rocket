-- Rocket rankings use visits to public Rocket app profiles, not Launch votes.
-- One anonymous visitor contributes at most one view per app per UTC day.
-- The edge function HMACs its short-lived visitor fingerprint before insert;
-- raw addresses, user agents and account IDs are never stored here.
create table app_graph.app_profile_view_events (
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  view_day date not null,
  viewer_hash text not null check (viewer_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (app_id, view_day, viewer_hash)
);
alter table app_graph.app_profile_view_events enable row level security;
revoke all on app_graph.app_profile_view_events from public, anon, authenticated;
grant all on app_graph.app_profile_view_events to service_role;

create table public.app_profile_view_counts (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  rocket_view_count bigint not null default 0 check (rocket_view_count >= 0),
  last_viewed_at timestamptz not null default now()
);
alter table public.app_profile_view_counts enable row level security;
revoke all on public.app_profile_view_counts from public, anon, authenticated;
grant select on public.app_profile_view_counts to anon, authenticated;
grant all on public.app_profile_view_counts to service_role;
create policy "Public Rocket app profile view counts"
  on public.app_profile_view_counts for select to anon, authenticated
  using (exists (
    select 1 from app_graph.apps a where a.id = app_id and a.is_public
  ));

create function app_graph.increment_app_profile_view_count() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.app_profile_view_counts (app_id, rocket_view_count, last_viewed_at)
    values (new.app_id, 1, new.created_at)
    on conflict (app_id) do update
      set rocket_view_count = public.app_profile_view_counts.rocket_view_count + 1,
          last_viewed_at = greatest(public.app_profile_view_counts.last_viewed_at, excluded.last_viewed_at);
  return new;
end;
$$;
revoke all on function app_graph.increment_app_profile_view_count() from public, anon, authenticated;
create trigger increment_app_profile_view_count
  after insert on app_graph.app_profile_view_events
  for each row execute function app_graph.increment_app_profile_view_count();

-- Service-only RPC keeps the private event schema off the Data API.
create function public.record_app_profile_view(
  p_app_id uuid, p_view_day date, p_viewer_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare inserted_count integer;
begin
  if p_view_day <> (now() at time zone 'utc')::date
      or p_viewer_hash !~ '^[a-f0-9]{64}$'
      or not exists (
        select 1 from app_graph.apps a where a.id = p_app_id and a.is_public
      ) then
    return false;
  end if;
  insert into app_graph.app_profile_view_events (app_id, view_day, viewer_hash)
    values (p_app_id, p_view_day, p_viewer_hash)
    on conflict do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;
revoke all on function public.record_app_profile_view(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.record_app_profile_view(uuid, date, text)
  to service_role;

-- Recreate because the previous view exposed Launch-vote columns.
drop view public.public_ranking_categories;
drop view public.public_app_rankings;
create view public.public_app_rankings with (security_invoker = true) as
select a.id as app_id, a.categories, a.launched_at,
  coalesce(v.rocket_view_count, 0)::bigint as rocket_view_count,
  v.last_viewed_at
from public.public_discoverable_apps a
left join public.app_profile_view_counts v on v.app_id = a.id;
create view public.public_ranking_categories with (security_invoker = true) as
select category, count(*)::integer as app_count
from public.public_app_rankings r
cross join lateral pg_catalog.unnest(r.categories) category
group by category
having count(*) >= 20;
revoke all on public.public_app_rankings, public.public_ranking_categories
  from public, anon, authenticated;
grant select on public.public_app_rankings, public.public_ranking_categories
  to anon, authenticated;
notify pgrst, 'reload schema';
