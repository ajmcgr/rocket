create table app_graph.valuation_funnel_events (
  event_id uuid primary key,
  session_id uuid not null,
  visitor_hash text not null check (length(visitor_hash) = 64),
  event_kind text not null check (event_kind in (
    'valuation_page_viewed','valuation_started','valuation_completed','valuation_signup_started',
    'valuation_app_selected','valuation_stripe_connected','valuation_ga4_connected','valuation_saved',
    'valuation_shared','valuation_listing_started','valuation_listing_published')),
  created_at timestamptz not null default now()
);
create index valuation_funnel_events_period_idx on app_graph.valuation_funnel_events(created_at desc, event_kind);
create index valuation_funnel_events_session_idx on app_graph.valuation_funnel_events(session_id, event_kind);
alter table app_graph.valuation_funnel_events enable row level security;
revoke all on app_graph.valuation_funnel_events from public, anon, authenticated;

create function public.record_rocket_valuation_event(p_event_id uuid, p_session_id uuid,
  p_visitor_hash text, p_event_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Access denied'; end if;
  if p_event_kind not in ('valuation_page_viewed','valuation_started','valuation_completed','valuation_signup_started',
    'valuation_app_selected','valuation_stripe_connected','valuation_ga4_connected','valuation_saved',
    'valuation_shared','valuation_listing_started','valuation_listing_published')
    or p_visitor_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_hash, 0));
  if (select count(*) from app_graph.valuation_funnel_events
      where visitor_hash = p_visitor_hash and created_at >= now() - interval '1 day') >= 100 then return false; end if;
  insert into app_graph.valuation_funnel_events(event_id,session_id,visitor_hash,event_kind)
    values(p_event_id,p_session_id,p_visitor_hash,p_event_kind) on conflict (event_id) do nothing;
  return true;
end;
$$;
revoke all on function public.record_rocket_valuation_event(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_rocket_valuation_event(uuid,uuid,text,text) to service_role;

create function public.rocket_admin_valuation_funnel(p_period text default '30d') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied'; end if;
  if p_period is null or p_period not in ('today','7d','30d','all') then raise exception 'Invalid period'; end if;
  cutoff := case p_period when 'today' then pg_catalog.date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' else null end;
  return (with events as (select session_id,event_kind from app_graph.valuation_funnel_events
      where cutoff is null or created_at >= cutoff),
    stages as (select event_kind, count(*) as events, count(distinct session_id) as sessions from events group by event_kind),
    completed as (select distinct session_id from events where event_kind='valuation_completed'),
    started as (select distinct session_id from events where event_kind='valuation_listing_started')
    select pg_catalog.jsonb_build_object(
      'stages', coalesce((select pg_catalog.jsonb_object_agg(event_kind, sessions) from stages), '{}'::jsonb),
      'completed_to_listing_started', (select count(*) from completed c join started s using(session_id)),
      'completion_to_listing_rate', case when (select count(*) from completed)=0 then null
        else pg_catalog.round((select count(*) from completed c join started s using(session_id))::numeric * 100
          / (select count(*) from completed),1) end));
end;
$$;
revoke all on function public.rocket_admin_valuation_funnel(text) from public,anon;
grant execute on function public.rocket_admin_valuation_funnel(text) to authenticated;
