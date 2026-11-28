-- Deployment order: apply this additive migration, deploy the event function,
-- then deploy the app. Historic events remain unattributed (NULL), not direct.
alter table app_graph.valuation_funnel_events
  add column source text,
  add column campaign text;
alter table app_graph.valuation_funnel_events
  add constraint valuation_funnel_events_source_check check (source is null or source in
    ('direct','organic_search','x','linkedin','developer_outreach','backlink_campaign',
     'distribution_partner','reddit','other_referral')),
  add constraint valuation_funnel_events_campaign_check check (campaign is null or campaign in
    ('none','seller_claim_a','seller_valuation_b','valuation_card'));
alter table app_graph.valuation_funnel_events drop constraint valuation_funnel_events_event_kind_check;
alter table app_graph.valuation_funnel_events add constraint valuation_funnel_events_event_kind_check
  check (event_kind in ('valuation_page_viewed','valuation_started','valuation_completed',
    'valuation_signup_started','valuation_signup_completed','valuation_draft_restored',
    'valuation_app_submitted','valuation_ownership_verified','valuation_app_selected',
    'valuation_stripe_connected','valuation_ga4_connected','valuation_saved','valuation_shared',
    'valuation_listing_started','valuation_listing_completed','valuation_card_generated',
    'valuation_listing_published'));

-- New function name keeps the deployed v2 Edge Function compatible while the
-- migration and Edge Function roll out independently.
create function public.record_rocket_seller_event(
  p_event_id uuid, p_session_id uuid, p_visitor_hash text, p_event_kind text,
  p_source text, p_campaign text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Access denied'; end if;
  if p_event_kind not in ('valuation_page_viewed','valuation_started','valuation_completed',
    'valuation_signup_started','valuation_signup_completed','valuation_draft_restored',
    'valuation_app_submitted','valuation_ownership_verified','valuation_app_selected',
    'valuation_stripe_connected','valuation_ga4_connected','valuation_saved','valuation_shared',
    'valuation_listing_started','valuation_listing_completed','valuation_card_generated',
    'valuation_listing_published')
    or p_source is null or p_source not in ('direct','organic_search','x','linkedin','developer_outreach',
      'backlink_campaign','distribution_partner','reddit','other_referral')
    or p_campaign is null or p_campaign not in ('none','seller_claim_a','seller_valuation_b','valuation_card')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));
  if (select count(*) from app_graph.valuation_funnel_events
      where visitor_hash = p_visitor_hash and created_at >= now() - interval '1 day') >= 100 then return false; end if;
  if p_event_kind in ('valuation_page_viewed','valuation_started','valuation_completed',
      'valuation_signup_started','valuation_signup_completed','valuation_draft_restored',
      'valuation_app_submitted','valuation_ownership_verified','valuation_listing_started',
      'valuation_listing_completed','valuation_card_generated','valuation_listing_published')
    and exists (select 1 from app_graph.valuation_funnel_events
      where session_id = p_session_id and event_kind = p_event_kind) then return false; end if;
  insert into app_graph.valuation_funnel_events
    (event_id,session_id,visitor_hash,event_kind,source,campaign)
    values (p_event_id,p_session_id,p_visitor_hash,p_event_kind,p_source,p_campaign)
    on conflict (event_id) do nothing;
  return true;
end;
$$;
revoke all on function public.record_rocket_seller_event(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_rocket_seller_event(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.rocket_admin_valuation_funnel(p_period text default '30d') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied'; end if;
  if p_period is null or p_period not in ('today','7d','30d','all') then raise exception 'Invalid period'; end if;
  cutoff := case p_period when 'today' then pg_catalog.date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' else null end;
  return (with events as (select session_id,event_kind,source,campaign from app_graph.valuation_funnel_events
      where cutoff is null or created_at >= cutoff),
    stages as (select event_kind, count(distinct session_id) as sessions from events group by event_kind),
    sources as (select coalesce(source,'unattributed') as source, count(distinct session_id) as sessions
      from events where event_kind = 'valuation_page_viewed' group by coalesce(source,'unattributed')),
    campaigns as (select coalesce(campaign,'unattributed') as campaign, count(distinct session_id) as sessions
      from events where event_kind = 'valuation_page_viewed' group by coalesce(campaign,'unattributed')),
    completed as (select distinct session_id from events where event_kind='valuation_completed'),
    started as (select distinct session_id from events where event_kind='valuation_listing_started')
    select pg_catalog.jsonb_build_object(
      'stages', coalesce((select pg_catalog.jsonb_object_agg(event_kind, sessions) from stages), '{}'::jsonb),
      'sources', coalesce((select pg_catalog.jsonb_object_agg(source, sessions) from sources), '{}'::jsonb),
      'campaigns', coalesce((select pg_catalog.jsonb_object_agg(campaign, sessions) from campaigns), '{}'::jsonb),
      'completed_to_listing_started', (select count(*) from completed c join started s using(session_id)),
      'completion_to_listing_rate', case when (select count(*) from completed)=0 then null
        else pg_catalog.round((select count(*) from completed c join started s using(session_id))::numeric * 100
          / (select count(*) from completed),1) end));
end;
$$;
