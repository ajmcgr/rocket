-- Keep catalogue browsing distinct from direct app profile visits.
alter table app_graph.discovery_journey_events
  drop constraint discovery_journey_events_surface_check;
alter table app_graph.discovery_journey_events
  add constraint discovery_journey_events_surface_check
  check (surface in ('homepage','catalogue','search','categories','collections','rankings','related','direct','mcp'));

create or replace function public.record_discovery_journey(
  p_event_id uuid, p_session_id uuid, p_event_kind text, p_surface text,
  p_section text, p_app_id uuid, p_search_id uuid, p_result_count integer,
  p_device text, p_acquisition_source text, p_visitor_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare inserted integer;
begin
  if p_event_id is null or p_session_id is null or
     p_event_kind is null or p_event_kind not in ('surface_view','search','search_results','app_card_click','app_profile_view','outbound_click') or
     p_surface is null or p_surface not in ('homepage','catalogue','search','categories','collections','rankings','related','direct','mcp') or
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
