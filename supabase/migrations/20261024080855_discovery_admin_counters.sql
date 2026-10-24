-- Store only an idempotency key, entry point, time and rotating daily hash.
-- Query text and account identifiers are deliberately not retained.
create table app_graph.discovery_search_events (
  event_id uuid primary key,
  source text not null check (source in ('header','homepage','discover')),
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table app_graph.discovery_search_events enable row level security;
revoke all on app_graph.discovery_search_events from public,anon,authenticated;
grant select,insert on app_graph.discovery_search_events to service_role;
create index discovery_search_events_created_idx on app_graph.discovery_search_events(created_at);
create index discovery_search_events_visitor_time_idx on app_graph.discovery_search_events(visitor_hash,created_at);
create index if not exists marketplace_clicks_day_idx on app_graph.marketplace_clicks(click_day);

create function public.record_discovery_search(p_event_id uuid,p_source text,p_visitor_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
  if p_event_id is null or p_source is null or p_source not in ('header','homepage','discover')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid search event';
  end if;
  -- Serialize each rotating visitor hash so concurrent requests cannot evade
  -- the small abuse limit. Retries with the same event ID count only once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_hash,0));
  if (select count(*) from app_graph.discovery_search_events
      where visitor_hash=p_visitor_hash and created_at>=now()-interval '1 minute') >= 60 then
    return false;
  end if;
  insert into app_graph.discovery_search_events(event_id,source,visitor_hash)
    values(p_event_id,p_source,p_visitor_hash) on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted=1;
end;
$$;
revoke all on function public.record_discovery_search(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_discovery_search(uuid,text,text) to service_role;

-- Change only the two placeholders in the existing admin-checked snapshot.
-- Preserve all other reporting and authorization logic, including later fixes.
do $patch$
declare definition text;
  placeholder text := '''searches'',null,''outbound_clicks'',null';
begin
  definition := pg_get_functiondef('public.rocket_admin_snapshot(text,text)'::regprocedure);
  if strpos(definition,placeholder)=0 then
    raise exception 'Expected discovery placeholders missing; inspect snapshot before applying';
  end if;
  execute replace(definition,placeholder,$counts$
        'searches',(select count(*) from app_graph.discovery_search_events where v_cutoff is null or created_at>=v_cutoff),
        -- Historical outbound records have only a UTC date; do not invent times.
        'outbound_clicks',(select count(*) from app_graph.marketplace_clicks where p_period='all'
          or click_day >= (now() at time zone 'UTC')::date - case p_period when '7d' then 6 when '30d' then 29 else 0 end)
  $counts$);
end;
$patch$;
