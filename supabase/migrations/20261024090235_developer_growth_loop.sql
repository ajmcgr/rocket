-- Minimal private first-party attribution; no query text, IPs, credentials,
-- metric values or cross-site identifiers. Existing provider records remain
-- authoritative for activation and verified outcomes; never count CTA clicks.
create table app_graph.rocket_growth_events (
  event_id uuid primary key,
  event_name text not null check(event_name in ('share_action','referral_visit','referral_signup')),
  target_kind text not null check(target_kind in ('app','profile')),
  target_id text not null,
  method text check(method in ('link','caption','download','intent','native')),
  visitor_hash text not null check(visitor_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid references auth.users(id) on delete cascade,
  referral_id uuid references app_graph.rocket_growth_events(event_id) on delete set null,
  created_at timestamptz not null default now(),
  check ((event_name='referral_signup')=(user_id is not null)),
  check ((event_name='share_action')=(method is not null))
);
alter table app_graph.rocket_growth_events enable row level security;
revoke all on app_graph.rocket_growth_events from public,anon,authenticated;
grant select,insert on app_graph.rocket_growth_events to service_role;
create unique index rocket_growth_one_signup on app_graph.rocket_growth_events(user_id) where event_name='referral_signup';
create index rocket_growth_event_time on app_graph.rocket_growth_events(event_name,created_at);
create index rocket_growth_visitor_time on app_graph.rocket_growth_events(visitor_hash,created_at);

create function public.record_rocket_growth_event(p_event_id uuid,p_event_name text,p_target_kind text,p_identifier text,
  p_method text,p_visitor_hash text,p_user_id uuid default null,p_referral_id uuid default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare target text; ref app_graph.rocket_growth_events; account_created timestamptz; inserted integer;
begin
  if p_event_id is null or p_event_name is null or p_event_name not in ('share_action','referral_visit','referral_signup')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid growth event'; end if;
  if p_event_name='referral_signup' then
    if p_user_id is null or p_referral_id is null then raise exception 'Confirmed account required'; end if;
    select created_at into account_created from auth.users where id=p_user_id and email_confirmed_at is not null and deleted_at is null;
    if account_created is null then return false; end if;
    select * into ref from app_graph.rocket_growth_events where event_id=p_referral_id and event_name='referral_visit'
      and created_at>=now()-interval '7 days' and created_at<=account_created;
    if not found or account_created<ref.created_at then return false; end if;
    p_target_kind:=ref.target_kind; target:=ref.target_id; p_method:=null;
  else
    if p_user_id is not null or p_referral_id is not null or p_target_kind is null or p_identifier is null
      or length(p_identifier)>120 then raise exception 'Invalid public event'; end if;
    if p_event_name='share_action' and (p_method is null or p_method not in ('link','caption','download','intent','native')) then raise exception 'Invalid share method'; end if;
    if p_event_name='referral_visit' and p_method is not null then raise exception 'Invalid visit'; end if;
    if p_target_kind='app' then
      select id::text into target from public.public_apps where slug=p_identifier or id::text=p_identifier;
    elsif p_target_kind='profile' then
      select username into target from public.member_public_profiles where username=p_identifier;
    end if;
    if target is null then return false; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_hash,0));
  if (select count(*) from app_graph.rocket_growth_events where visitor_hash=p_visitor_hash and created_at>=now()-interval '1 minute')>=60 then return false; end if;
  insert into app_graph.rocket_growth_events(event_id,event_name,target_kind,target_id,method,visitor_hash,user_id,referral_id)
    values(p_event_id,p_event_name,p_target_kind,target,p_method,p_visitor_hash,p_user_id,p_referral_id) on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end;
$$;
revoke all on function public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid) to service_role;

-- Counts are unique connections / developers, not repeated syncs or button
-- clicks. "Activation" means the first recorded successful production sync
-- on a currently owned domain-verified app, using actual retained records.
create function public.rocket_admin_growth(p_period text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz; result jsonb;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_period not in ('today','7d','30d','all') then raise exception 'Invalid period'; end if;
  cutoff:=case p_period when 'today' then date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
    when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' else null end;
  with analytics as (
    select 'analytics'::text as kind,c.id,c.owner_user_id as user_id,min(m.created_at) as first_sync
    from public.app_data_connections c join public.app_metric_points m on m.connection_id=c.id and m.app_id=c.app_id
    join public.app_owners o on o.app_id=c.app_id and o.user_id=c.owner_user_id and o.revoked_at is null and o.verification_level='domain_verified'
    where m.verification_status='verified' and c.last_successful_sync is not null and m.created_at<=c.last_successful_sync
    group by c.id,c.owner_user_id
  ), revenue as (
    select 'revenue'::text as kind,c.id,c.owner_user_id as user_id,min(m.observed_at) as first_sync
    from public.app_revenue_connections c join public.app_revenue_metric_points m on m.connection_id=c.id
    join public.app_owners o on o.app_id=m.app_id and o.user_id=c.owner_user_id and o.revoked_at is null and o.verification_level='domain_verified'
    where c.livemode and m.source_livemode and m.verification_status='verified' and m.observed_at<=c.last_successful_sync
    group by c.id,c.owner_user_id
    union all
    select 'revenue',c.id,c.owner_user_id,min(m.observed_at)
    from public.app_verified_revenue_connections c join public.app_verified_revenue_points m on m.connection_id=c.id and m.owner_user_id=c.owner_user_id
    join public.app_owners o on o.app_id=m.app_id and o.user_id=c.owner_user_id and o.revoked_at is null and o.verification_level='domain_verified'
    where m.source_environment='production' and m.observed_at<=c.last_successful_sync
    group by c.id,c.owner_user_id
  ), verified as (select * from analytics union all select * from revenue), activated as (
    select user_id,min(first_sync) as first_sync from verified group by user_id
  ) select jsonb_build_object(
    'activated_developers',(select count(*) from activated where cutoff is null or first_sync>=cutoff),
    'verified_analytics_connections',(select count(*) from analytics where cutoff is null or first_sync>=cutoff),
    'verified_revenue_connections',(select count(*) from revenue where cutoff is null or first_sync>=cutoff),
    'share_actions',(select count(*) from app_graph.rocket_growth_events where event_name='share_action' and (cutoff is null or created_at>=cutoff)),
    'referral_visits',(select count(*) from app_graph.rocket_growth_events where event_name='referral_visit' and (cutoff is null or created_at>=cutoff)),
    'referral_registrations',(select count(*) from app_graph.rocket_growth_events where event_name='referral_signup' and (cutoff is null or created_at>=cutoff)),
    'referred_developers_with_claims',(select count(distinct e.user_id) from app_graph.rocket_growth_events e join public.app_owners o on o.user_id=e.user_id
      and o.revoked_at is null and o.verified_at>=e.created_at where e.event_name='referral_signup' and (cutoff is null or o.verified_at>=cutoff))
  ) into result;
  return result;
end;
$$;
revoke all on function public.rocket_admin_growth(text) from public,anon;
grant execute on function public.rocket_admin_growth(text) to authenticated,service_role;

do $patch$
declare definition text;
begin
  definition:=pg_get_functiondef('public.rocket_admin_snapshot(text,text)'::regprocedure);
  if strpos(definition,'  return v_result;')=0 then raise exception 'Inspect admin snapshot before patching'; end if;
  execute replace(definition,'  return v_result;',$body$
  if p_section in ('home','metrics') then
    v_result:=jsonb_set(v_result,'{growth}',public.rocket_admin_growth(p_period));
  end if;
  return v_result;
$body$);
end;
$patch$;
