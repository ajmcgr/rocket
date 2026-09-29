-- Slice 4: public Launch-only evidence and a private research shortlist.
-- All derived rows are replaceable snapshots; source identity and owner data are untouched.
create table app_graph.app_intelligence (
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  signal_type text not null check (signal_type in ('rising', 'new_interesting')),
  evidence_source text not null default 'launch' check (evidence_source = 'launch'),
  net_votes integer not null check (net_votes >= 0),
  age_band text not null check (age_band in ('0-7', '8-30', '31-90')),
  cohort_category text,
  cohort_size integer not null check (cohort_size >= 20),
  percentile_rank numeric(6,5) not null check (percentile_rank between 0 and 1),
  category_median_votes numeric(10,2),
  source_updated_at timestamptz not null,
  calculated_at timestamptz not null default now(),
  calculation_version integer not null default 1,
  primary key (app_id, signal_type)
);

create index app_intelligence_signal_rank_idx
  on app_graph.app_intelligence (signal_type, percentile_rank desc, net_votes desc, app_id);

create table app_graph.category_intelligence (
  category text primary key,
  recent_launches integer not null,
  previous_launches integer not null,
  launch_volume_change_pct numeric(9,1),
  median_recent_votes numeric(10,2),
  top_decile_recent_count integer not null,
  recent_catalogue_share_pct numeric(7,2) not null,
  window_ends_at timestamptz not null,
  calculated_at timestamptz not null default now(),
  calculation_version integer not null default 1
);

create table public.saved_apps (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, app_id)
);
create index saved_apps_user_date_idx on public.saved_apps (user_id, saved_at desc, app_id);

alter table app_graph.app_intelligence enable row level security;
alter table app_graph.category_intelligence enable row level security;
alter table public.saved_apps enable row level security;

create policy "Public Launch intelligence" on app_graph.app_intelligence
  for select to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );
create policy "Public category intelligence" on app_graph.category_intelligence
  for select to anon, authenticated using (true);
create policy "Users see saved apps" on public.saved_apps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users save public apps" on public.saved_apps
  for insert to authenticated with check (
    user_id = (select auth.uid()) and
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );
create policy "Users unsave apps" on public.saved_apps
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on app_graph.app_intelligence, app_graph.category_intelligence to anon, authenticated;
grant all on app_graph.app_intelligence, app_graph.category_intelligence, public.saved_apps to service_role;
grant select, insert, delete on public.saved_apps to authenticated;
revoke all on public.saved_apps from anon;

create view public.public_app_intelligence with (security_invoker = true) as
select i.app_id, i.signal_type, i.evidence_source, i.net_votes, i.age_band,
  i.cohort_category, i.cohort_size, i.percentile_rank, i.category_median_votes,
  i.source_updated_at, i.calculated_at, i.calculation_version
from app_graph.app_intelligence i;

create view public.public_category_intelligence with (security_invoker = true) as
select category, recent_launches, previous_launches, launch_volume_change_pct,
  median_recent_votes, top_decile_recent_count, recent_catalogue_share_pct,
  window_ends_at, calculated_at, calculation_version
from app_graph.category_intelligence;

revoke all on public.public_app_intelligence, public.public_category_intelligence from public;
grant select on public.public_app_intelligence, public.public_category_intelligence to anon, authenticated;

-- Vote counts are a public aggregate in Launch's product_vote_counts view.
-- The service-role sync may update only existing Launch source evidence.
create function public.sync_launch_vote_counts(p_items jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_updated integer := 0; v_rows integer;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'Vote batch must contain at most 100 records';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if (v_item->>'launch_id') !~ '^[0-9a-f-]{36}$'
      or (v_item->>'net_votes') !~ '^[0-9]{1,9}$'
      or (v_item->>'total_votes') !~ '^[0-9]{1,9}$' then
      raise exception 'Invalid public vote record';
    end if;
    update app_graph.app_sources set public_evidence =
      public_evidence || pg_catalog.jsonb_build_object(
        'net_votes', (v_item->>'net_votes')::integer,
        'total_votes', (v_item->>'total_votes')::integer,
        'votes_observed_at', now()
      )
    where source_type = 'launch' and external_id = v_item->>'launch_id'
      and match_state = 'attached' and status = 'active';
    get diagnostics v_rows = row_count;
    v_updated := v_updated + v_rows;
  end loop;
  return v_updated;
end;
$$;

-- A single transaction replaces both snapshots. If any calculation fails, the
-- previous successful state remains visible. Category is the first stable
-- alphabetically sorted Launch category from the Slice 1 import.
create function public.refresh_launch_intelligence()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := now(); v_signals integer; v_categories integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(20260929, 4) then
    raise exception 'Launch intelligence refresh already running';
  end if;
  delete from app_graph.app_intelligence;
  with eligible as (
    select a.id, a.categories[1] primary_category, a.launched_at,
      case when a.launched_at >= v_now - interval '7 days' then '0-7'
           when a.launched_at >= v_now - interval '30 days' then '8-30'
           else '31-90' end age_band,
      (s.public_evidence->>'net_votes')::integer net_votes,
      (s.public_evidence->>'votes_observed_at')::timestamptz votes_observed_at
    from app_graph.apps a join app_graph.app_sources s on s.app_id = a.id
      and s.source_type = 'launch' and s.status = 'active' and s.match_state = 'attached'
    where a.is_public and a.launched_at between v_now - interval '90 days' and v_now
      and s.public_evidence->>'net_votes' ~ '^[0-9]{1,9}$'
      and s.public_evidence->>'votes_observed_at' is not null
  ), medians as (
    select age_band, primary_category,
      pg_catalog.percentile_cont(0.5) within group (order by net_votes) category_median
    from eligible group by age_band, primary_category
  ), ranked as (
    select e.*,
      count(*) over (partition by e.age_band) global_n,
      pg_catalog.percent_rank() over (partition by e.age_band order by e.net_votes) global_rank,
      count(*) over (partition by e.age_band, e.primary_category) category_n,
      pg_catalog.percent_rank() over (partition by e.age_band, e.primary_category order by e.net_votes) category_rank,
      m.category_median
    from eligible e left join medians m on m.age_band = e.age_band
      and m.primary_category is not distinct from e.primary_category
  ), comparable as (
    select *, case when category_n >= 20 then category_n else global_n end cohort_n,
      case when category_n >= 20 then category_rank else global_rank end cohort_rank,
      case when category_n >= 20 then primary_category else null end cohort_category,
      case when category_n >= 20 then category_median else null end cohort_median
    from ranked
  ), signals as (
    select *, 'rising'::text signal_type from comparable
      where launched_at >= v_now - interval '30 days' and net_votes >= 3
        and cohort_n >= 50 and cohort_rank >= 0.90
    union all
    select *, 'new_interesting'::text signal_type from comparable
      where age_band = '0-7' and net_votes >= 2
        and cohort_n >= 50 and cohort_rank >= 0.90
  )
  insert into app_graph.app_intelligence
    (app_id, signal_type, net_votes, age_band, cohort_category, cohort_size,
     percentile_rank, category_median_votes, source_updated_at, calculated_at)
  select id, signal_type, net_votes, age_band, cohort_category, cohort_n,
    cohort_rank, cohort_median, votes_observed_at, v_now from signals;
  get diagnostics v_signals = row_count;

  delete from app_graph.category_intelligence;
  with recent as (
    select a.id, category, a.launched_at,
      case when s.public_evidence->>'net_votes' ~ '^[0-9]{1,9}$'
        then (s.public_evidence->>'net_votes')::integer else null end net_votes
    from app_graph.apps a cross join lateral pg_catalog.unnest(a.categories) category
    left join app_graph.app_sources s on s.app_id = a.id
      and s.source_type = 'launch' and s.status = 'active' and s.match_state = 'attached'
    where a.is_public and a.launched_at between v_now - interval '60 days' and v_now
  ), counts as (
    select category,
      count(*) filter (where launched_at >= v_now - interval '30 days')::integer recent_n,
      count(*) filter (where launched_at < v_now - interval '30 days')::integer previous_n,
      pg_catalog.percentile_cont(0.5) within group (order by net_votes)
        filter (where launched_at >= v_now - interval '30 days') median_votes
    from recent group by category
  ), high as (
    select category,count(*)::integer high_n from recent
    where launched_at >= v_now - interval '30 days' and net_votes >= 3
    group by category
  )
  insert into app_graph.category_intelligence
    (category,recent_launches,previous_launches,launch_volume_change_pct,
     median_recent_votes,top_decile_recent_count,recent_catalogue_share_pct,
     window_ends_at,calculated_at)
  select c.category,c.recent_n,c.previous_n,
    pg_catalog.round((c.recent_n - c.previous_n) * 100.0 / c.previous_n,1),
    c.median_votes,coalesce(h.high_n,0),
    pg_catalog.round(c.recent_n * 100.0 / nullif((select count(*) from app_graph.apps
      where is_public and launched_at >= v_now - interval '30 days'),0),2),
    v_now,v_now
  from counts c left join high h using (category)
  where c.recent_n >= 10 and c.previous_n >= 10;
  get diagnostics v_categories = row_count;
  return pg_catalog.jsonb_build_object('signals',v_signals,'categories',v_categories,
    'calculated_at',v_now,'calculation_version',1);
end;
$$;

revoke all on function public.sync_launch_vote_counts(jsonb) from public, anon, authenticated;
revoke all on function public.refresh_launch_intelligence() from public, anon, authenticated;
grant execute on function public.sync_launch_vote_counts(jsonb) to service_role;
grant execute on function public.refresh_launch_intelligence() to service_role;
