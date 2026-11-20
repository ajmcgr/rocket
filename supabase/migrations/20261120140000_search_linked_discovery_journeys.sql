-- Search result clicks and their subsequent profile/outbound journeys share
-- the search ID, so the existing search-only constraint rejects valid events.
alter table app_graph.discovery_journey_events
  drop constraint discovery_journey_events_check1;

alter table app_graph.discovery_journey_events
  add constraint discovery_journey_events_search_id_check check (
    (event_kind in ('search', 'search_results') and search_id is not null)
    or (event_kind in ('app_card_click', 'app_profile_view', 'outbound_click')
      and (search_id is null or surface = 'search'))
    or (event_kind = 'surface_view' and search_id is null)
  );
