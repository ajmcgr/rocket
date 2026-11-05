-- Tab-scoped discovery journeys. No query text, account ID, IP, or persistent visitor ID.
create table app_graph.discovery_journey_events (
  event_id uuid primary key,
  session_id uuid not null,
  event_kind text not null check (event_kind in ('surface_view','search','search_results','app_card_click','app_profile_view','outbound_click')),
  surface text not null check (surface in ('homepage','search','categories','collections','rankings','related','direct','mcp')),
  section text check (section ~ '^[a-z0-9_-]{1,48}$'),
  app_id uuid,
  search_id uuid,
  result_count integer check (result_count between 0 and 100000),
  device text not null check (device in ('mobile','tablet','desktop')),
  acquisition_source text not null check (acquisition_source in ('organic','direct','social','referral','mcp')),
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check ((event_kind in ('app_card_click','app_profile_view','outbound_click')) = (app_id is not null)),
  check ((event_kind in ('search','search_results')) = (search_id is not null)),
  check ((event_kind = 'search_results') = (result_count is not null))
);
alter table app_graph.discovery_journey_events enable row level security;
revoke all on app_graph.discovery_journey_events from public, anon, authenticated;
grant select, insert on app_graph.discovery_journey_events to service_role;
create index discovery_journey_events_time_idx on app_graph.discovery_journey_events(created_at);
create index discovery_journey_events_session_idx on app_graph.discovery_journey_events(session_id, created_at);
create index discovery_journey_events_search_idx on app_graph.discovery_journey_events(search_id, event_kind) where search_id is not null;
create index discovery_journey_events_hash_time_idx on app_graph.discovery_journey_events(visitor_hash, created_at);

create function public.record_discovery_journey(
  p_event_id uuid, p_session_id uuid, p_event_kind text, p_surface text,
  p_section text, p_app_id uuid, p_search_id uuid, p_result_count integer,
  p_device text, p_acquisition_source text, p_visitor_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare inserted integer;
begin
  if p_event_id is null or p_session_id is null or
     p_event_kind is null or p_event_kind not in ('surface_view','search','search_results','app_card_click','app_profile_view','outbound_click') or
     p_surface is null or p_surface not in ('homepage','search','categories','collections','rankings','related','direct','mcp') or
     p_device is null or p_device not in ('mobile','tablet','desktop') or
     p_acquisition_source is null or p_acquisition_source not in ('organic','direct','social','referral','mcp') or
     p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' or
     (p_section is not null and p_section !~ '^[a-z0-9_-]{1,48}$') then
    raise exception 'Invalid discovery event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_hash, 0));
  if (select count(*) from app_graph.discovery_journey_events
      where visitor_hash = p_visitor_hash and created_at >= now() - interval '1 minute') >= 120 then
    return false;
  end if;
  insert into app_graph.discovery_journey_events
    (event_id, session_id, event_kind, surface, section, app_id, search_id, result_count, device, acquisition_source, visitor_hash)
  values (p_event_id, p_session_id, p_event_kind, p_surface, p_section, p_app_id, p_search_id, p_result_count, p_device, p_acquisition_source, p_visitor_hash)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
revoke all on function public.record_discovery_journey(uuid,uuid,text,text,text,uuid,uuid,integer,text,text,text) from public, anon, authenticated;
grant execute on function public.record_discovery_journey(uuid,uuid,text,text,text,uuid,uuid,integer,text,text,text) to service_role;

create function public.rocket_admin_discovery_journeys(p_period text default '7d')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied'; end if;
  if p_period is null or p_period not in ('today','7d','30d','all') then raise exception 'Invalid period'; end if;
  cutoff := case p_period when 'today' then date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    when '7d' then now() - interval '7 days' when '30d' then now() - interval '30 days' else null end;
  return (
    with events as (
      select * from app_graph.discovery_journey_events where cutoff is null or created_at >= cutoff
    ), searches as (
      select session_id, search_id from events where event_kind = 'search'
    ), acquisition as (
      select acquisition_source, count(distinct session_id) as sessions from events
      group by acquisition_source
    ), funnel as (
      select surface, section,
        count(*) filter (where event_kind = 'surface_view') as visits,
        count(*) filter (where event_kind = 'app_card_click') as card_clicks,
        count(*) filter (where event_kind = 'app_profile_view') as profile_views,
        count(*) filter (where event_kind = 'outbound_click') as outbound_clicks
      from events group by surface, section
    )
    select pg_catalog.jsonb_build_object(
      'since', (select min(created_at) from app_graph.discovery_journey_events),
      'visits', (select count(*) from events where event_kind = 'surface_view'),
      'tab_sessions', (select count(distinct session_id) from events),
      'total_searches', (select count(*) from searches),
      'search_sessions', (select count(distinct session_id) from searches),
      'search_result_clicks', (select count(*) from events where event_kind = 'app_card_click' and search_id is not null),
      'zero_result_searches', (select count(*) from events where event_kind = 'search_results' and result_count = 0),
      'searches_without_clicks', (select count(*) from searches s where not exists
        (select 1 from events e where e.search_id = s.search_id and e.event_kind = 'app_card_click')),
      'search_to_profile', (select count(*) from searches s where exists
        (select 1 from events e where e.search_id = s.search_id and e.event_kind = 'app_profile_view')),
      'search_to_outbound', (select count(*) from searches s where exists
        (select 1 from events e where e.search_id = s.search_id and e.event_kind = 'outbound_click')),
      'acquisition_sessions', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'source', acquisition_source, 'sessions', sessions) order by acquisition_source) from acquisition), '[]'::jsonb),
      'surfaces', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'surface', surface, 'section', section, 'visits', visits, 'card_clicks', card_clicks,
        'profile_views', profile_views, 'outbound_clicks', outbound_clicks)
        order by surface, section) from funnel), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.rocket_admin_discovery_journeys(text) from public, anon;
grant execute on function public.rocket_admin_discovery_journeys(text) to authenticated;
