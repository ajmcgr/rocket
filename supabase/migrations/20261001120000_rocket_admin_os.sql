-- Rocket Admin OS: private operating records and a narrow, server-authorized API.
-- An authenticated JWT is necessary but not sufficient: every RPC checks the
-- confirmed identity in auth.users. No raw admin table is granted to clients.
create table public.rocket_admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index rocket_admin_audit_recent_idx on public.rocket_admin_audit(created_at desc);
alter table public.rocket_admin_audit enable row level security;
revoke all on public.rocket_admin_audit from public, anon, authenticated;
grant all on public.rocket_admin_audit to service_role;

create table public.rocket_editorial_picks (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id),
  editor_user_id uuid not null references auth.users(id),
  status text not null check (status in ('featured','unfeatured')),
  placement text not null check (placement in ('lead','secondary','standard')),
  headline text,
  editorial_note text,
  featured_at timestamptz not null default now(),
  unfeatured_at timestamptz
);
create unique index rocket_editorial_one_active_per_app on public.rocket_editorial_picks(app_id) where status='featured';
create index rocket_editorial_recent_idx on public.rocket_editorial_picks(featured_at desc);
alter table public.rocket_editorial_picks enable row level security;
revoke all on public.rocket_editorial_picks from public, anon, authenticated;
grant all on public.rocket_editorial_picks to service_role;

create view public.public_rocket_picks with (security_invoker = true) as
select p.app_id,p.placement,p.headline,p.featured_at
from public.rocket_editorial_picks p
join public.public_discoverable_apps a on a.id=p.app_id
where p.status='featured';
revoke all on public.public_rocket_picks from public;
grant select on public.public_rocket_picks to anon,authenticated;
create policy "Public active Rocket Picks" on public.rocket_editorial_picks
  for select to anon,authenticated using (status='featured');
grant select(app_id,placement,headline,featured_at,status) on public.rocket_editorial_picks to anon,authenticated;

-- Test-mode queue infrastructure. The CHECK prevents real sending from being
-- enabled by a UI toggle; activation requires an explicit reviewed migration.
create table public.rocket_outreach_control (
  id boolean primary key default true check (id),
  paused boolean not null default true,
  send_mode text not null default 'test' check (send_mode='test'),
  updated_at timestamptz not null default now()
);
insert into public.rocket_outreach_control(id) values(true);
alter table public.rocket_outreach_control enable row level security;
revoke all on public.rocket_outreach_control from public, anon, authenticated;
grant all on public.rocket_outreach_control to service_role;

create table public.rocket_outreach_queue (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id),
  launch_product_id text not null,
  recipient_email text not null,
  founder_user_id text not null,
  status text not null default 'eligible' check (status in
    ('eligible','queued','sent','delivered','clicked','claimed','verified','connected','bounced','suppressed','skipped','failed')),
  invitation_token_hash text unique,
  invitation_expires_at timestamptz,
  invitation_redeemed_at timestamptz,
  sent_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(launch_product_id,recipient_email)
);
create index rocket_outreach_queue_status_idx on public.rocket_outreach_queue(status,created_at);
create index rocket_outreach_queue_app_idx on public.rocket_outreach_queue(app_id);
alter table public.rocket_outreach_queue enable row level security;
revoke all on public.rocket_outreach_queue from public, anon, authenticated;
grant all on public.rocket_outreach_queue to service_role;

create table public.rocket_outreach_suppressions (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.rocket_outreach_suppressions enable row level security;
revoke all on public.rocket_outreach_suppressions from public, anon, authenticated;
grant all on public.rocket_outreach_suppressions to service_role;

create function public.is_rocket_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) = 'alex@alexmacgregor.com'
      and u.email_confirmed_at is not null
      and u.deleted_at is null
  );
$$;
revoke all on function public.is_rocket_admin() from public, anon;
grant execute on function public.is_rocket_admin() to authenticated;
grant execute on function public.is_rocket_admin() to service_role;

-- Ordinary reviewers still cannot change another review's identity or state.
-- A confirmed Rocket admin may moderate status through the audited RPC below.
create or replace function app_graph.protect_review_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.app_id is distinct from old.app_id or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    if auth.role() <> 'service_role' then raise exception 'Review identity cannot be changed'; end if;
  end if;
  if new.status is distinct from old.status and auth.role() <> 'service_role'
    and not public.is_rocket_admin() then
    raise exception 'Review status cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.rocket_admin_snapshot(p_section text, p_period text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cutoff timestamptz; v_result jsonb;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_period not in ('today','7d','30d','all') then raise exception 'Invalid period'; end if;
  v_cutoff := case p_period when 'today' then date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
    when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' else null end;
  if p_section in ('home','metrics') then
    select jsonb_build_object(
      'period',p_period,
      'catalogue',jsonb_build_object(
        'indexed',(select count(*) from app_graph.apps),
        'discoverable',(select count(*) from public.public_discoverable_apps),
        'claimed',(select count(*) from public.app_owners where revoked_at is null),
        'domain_verified',(select count(*) from public.app_owners where revoked_at is null and verification_level='domain_verified'),
        'traffic_verified',(select count(distinct app_id) from public.app_data_connections where status='active'),
        'revenue_verified',(select count(distinct app_id) from public.app_revenue_bindings b join public.app_revenue_connections c on c.id=b.connection_id where c.status='active'),
        'held_ambiguous',(select count(*) from app_graph.app_sources where match_state='ambiguous' and status='active'),
        'rocket_id_connected',null,'buy_enabled',null,'usage_verified',null),
      'users',jsonb_build_object(
        'members',(select count(*) from auth.users where deleted_at is null),
        'new_members',(select count(*) from auth.users where deleted_at is null and (v_cutoff is null or created_at>=v_cutoff)),
        'developer_members',(select count(*) from public.rocket_developer_memberships where status in ('active','trialing'))),
      'discovery',jsonb_build_object(
        'profile_views',(select count(*) from app_graph.app_profile_view_events where v_cutoff is null or created_at>=v_cutoff),
        'saves',(select count(*) from public.saved_apps where v_cutoff is null or saved_at>=v_cutoff),
        'reviews',(select count(*) from app_graph.app_reviews where v_cutoff is null or created_at>=v_cutoff),
        'searches',null,'outbound_clicks',null),
      'funnel',jsonb_build_object(
        'submissions',(select count(*) from public.app_jobs where v_cutoff is null or created_at>=v_cutoff),
        'claims',(select count(*) from public.app_claims where v_cutoff is null or created_at>=v_cutoff),
        'ga4_connections',(select count(*) from public.app_data_connections where v_cutoff is null or created_at>=v_cutoff),
        'revenue_connections',(select count(*) from public.app_revenue_connections where v_cutoff is null or created_at>=v_cutoff)),
      'attention',jsonb_build_object(
        'claim_review',(select count(*) from public.app_claims where status='review'),
        'review_reports',(select count(*) from app_graph.app_review_reports),
        'failed_imports',(select count(*) from app_graph.app_import_jobs where status='failed' and started_at>=now()-interval '7 days'),
        'provider_failures',(select count(*) from public.app_data_connections where status='error')+(select count(*) from public.app_revenue_connections where status='error'),
        'site_failures',(select count(*) from app_graph.app_website_health where status='hard_failure')),
      'outreach',(select coalesce(jsonb_object_agg(status,n), '{}'::jsonb) from (select status,count(*) n from public.rocket_outreach_queue group by status) q)
    ) into v_result;
  elsif p_section='ops' then
    select jsonb_build_object(
      'apps',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select a.id,a.name,a.slug,a.is_public,a.claim_state,a.website_url,h.status as website_status,
          h.checked_at, (select count(*) from app_graph.app_sources s where s.app_id=a.id) as source_count
        from app_graph.apps a left join app_graph.app_website_health h on h.app_id=a.id
        order by a.updated_at desc limit 30) x),
      'claims',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select c.id,c.app_id,a.name as app_name,c.user_id,c.method,c.status,c.review_reason,c.created_at
        from public.app_claims c join app_graph.apps a on a.id=c.app_id
        where c.status in ('pending','review') order by c.created_at desc limit 50) x),
      'reports',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select rr.id,rr.review_id,rr.reason,rr.created_at,r.app_id,r.status as review_status,r.body
        from app_graph.app_review_reports rr join app_graph.app_reviews r on r.id=rr.review_id
        order by rr.created_at desc limit 50) x),
      'sync_jobs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select id,status,expected_count,received_count,imported_count,ambiguous_count,started_at,finished_at,error
        from app_graph.app_import_jobs order by started_at desc limit 10) x),
      'provider_failures',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select app_id,provider,status,last_attempted_sync,last_successful_sync,last_error from public.app_data_connections
        where status='error' order by updated_at desc limit 30) x),
      'website_issues',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select h.app_id,a.name,h.status,h.checked_at,h.consecutive_hard_failures
        from app_graph.app_website_health h join app_graph.apps a on a.id=h.app_id
        where h.status<>'working' order by h.checked_at desc limit 30) x),
      'members',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select id,email,created_at,email_confirmed_at from auth.users where deleted_at is null
        order by created_at desc limit 30) x)
    ) into v_result;
  elsif p_section='marketing' then
    select jsonb_build_object(
      'candidates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select a.id,a.name,a.slug,a.tagline,a.website_url,a.logo_url,a.categories,a.launched_at,
          i.signal_type,i.net_votes,i.percentile_rank,i.calculated_at,
          coalesce((select bool_or(v.external_marketing_allowed) from public.app_metric_visibility v where v.app_id=a.id),false) as marketing_permission
        from public.public_discoverable_apps a left join public.public_app_intelligence i on i.app_id=a.id
        order by i.percentile_rank desc nulls last,a.launched_at desc nulls last limit 60) x),
      'picks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select p.id,p.app_id,a.name,a.slug,p.status,p.placement,p.headline,p.editorial_note,p.featured_at,p.unfeatured_at
        from public.rocket_editorial_picks p join app_graph.apps a on a.id=p.app_id
        order by p.featured_at desc limit 100) x)
    ) into v_result;
  elsif p_section='outreach' then
    select jsonb_build_object(
      'control',(select to_jsonb(c) from public.rocket_outreach_control c where id=true),
      'counts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status,count(*) n from public.rocket_outreach_queue group by status) q),
      'queue',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
        select id,app_id,launch_product_id,recipient_email,status,sent_at,last_event_at,last_error,created_at
        from public.rocket_outreach_queue order by created_at desc limit 100) x)
    ) into v_result;
  else raise exception 'Invalid admin section'; end if;
  return v_result;
end;
$$;
revoke all on function public.rocket_admin_snapshot(text,text) from public, anon;
grant execute on function public.rocket_admin_snapshot(text,text) to authenticated;

create function public.rocket_admin_action(p_action text,p_target uuid,p_reason text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_app uuid; v_status text;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_reason is not null and length(p_reason)>1000 then raise exception 'Reason too long'; end if;
  if p_action in ('feature','unfeature','hide_app','restore_app') then
    select id into v_app from app_graph.apps where id=p_target for update;
    if v_app is null then raise exception 'Unknown app'; end if;
  end if;
  case p_action
    when 'feature' then
      if not exists(select 1 from public.public_discoverable_apps where id=p_target) then raise exception 'App is not discoverable'; end if;
      insert into public.rocket_editorial_picks(app_id,editor_user_id,status,placement,headline,editorial_note)
        values(p_target,v_user,'featured',coalesce(nullif(p_payload->>'placement',''),'standard'),
          left(nullif(p_payload->>'headline',''),160),left(nullif(p_payload->>'note',''),1000));
    when 'unfeature' then
      update public.rocket_editorial_picks set status='unfeatured',unfeatured_at=now()
        where app_id=p_target and status='featured';
      if not found then raise exception 'App is not featured'; end if;
    when 'hide_app' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'An objective reason is required'; end if;
      if exists(select 1 from public.app_owners where app_id=p_target and revoked_at is null) then
        raise exception 'Claimed app moderation requires a separate ownership review';
      end if;
      update app_graph.apps set is_public=false,updated_at=now() where id=p_target;
    when 'restore_app' then
      update app_graph.apps set is_public=true,updated_at=now() where id=p_target;
    when 'reject_claim' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A claim decision reason is required'; end if;
      update public.app_claims set status='rejected',rejected_at=now(),review_reason=p_reason
        where id=p_target and status in ('pending','review');
      if not found then raise exception 'Claim is not pending review'; end if;
    when 'approve_claim' then
      if length(trim(coalesce(p_reason,'')))<20 then raise exception 'Document the evidence for approval'; end if;
      select c.app_id into v_app from public.app_claims c
        where c.id=p_target and c.status in ('pending','review')
          and c.method in ('manual_review','existing_relationship') for update;
      if v_app is null then raise exception 'Claim is not eligible for manual approval'; end if;
      if exists(select 1 from public.app_owners o where o.app_id=v_app and o.revoked_at is null) then
        raise exception 'An active owner already exists; do not overwrite ownership';
      end if;
      insert into public.app_owners(app_id,user_id,claim_id,verification_level)
        select c.app_id,c.user_id,c.id,'claimed' from public.app_claims c where c.id=p_target;
      update public.app_claims set status='verified',verification_state='credible',
        completed_at=now(),review_reason=p_reason where id=p_target;
      update app_graph.apps set claim_state='claimed',updated_at=now() where id=v_app;
    when 'request_claim_correction' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Correction instructions are required'; end if;
      update public.app_claims set status='review',review_reason=p_reason
        where id=p_target and status in ('pending','review');
      if not found then raise exception 'Claim is not pending review'; end if;
    when 'hide_review' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A moderation reason is required'; end if;
      update app_graph.app_reviews set status='hidden' where id=p_target and status='published';
      if not found then raise exception 'Review is not published'; end if;
    when 'restore_review' then
      update app_graph.app_reviews set status='published' where id=p_target and status='hidden';
      if not found then raise exception 'Review is not hidden'; end if;
    when 'pause_outreach' then
      update public.rocket_outreach_control set paused=true,updated_at=now() where id=true;
    when 'skip_outreach' then
      update public.rocket_outreach_queue set status='skipped',updated_at=now()
        where id=p_target and status in ('eligible','queued');
      if not found then raise exception 'Outreach item is not eligible'; end if;
    else raise exception 'Unsupported admin action';
  end case;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(v_user,p_action,case when p_action like '%claim%' then 'claim' when p_action like '%review%' then 'review'
      when p_action like '%outreach%' then 'outreach' else 'app' end,
      coalesce(p_target::text,'control'),jsonb_build_object('reason',p_reason,'payload',p_payload));
  return jsonb_build_object('ok',true,'action',p_action,'target',p_target);
end;
$$;
revoke all on function public.rocket_admin_action(text,uuid,text,jsonb) from public, anon;
grant execute on function public.rocket_admin_action(text,uuid,text,jsonb) to authenticated;
