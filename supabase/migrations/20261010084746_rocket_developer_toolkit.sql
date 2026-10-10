-- Rocket Developer toolkit: private beta and optimizer state. All writes pass
-- through authenticated Edge Functions, which recheck ownership and membership.
create table public.rocket_beta_programs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null unique references app_graph.apps(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  message text not null default '' check (char_length(message) <= 500),
  access_type text not null check (access_type in ('open_waitlist','approval_required')),
  capacity integer check (capacity is null or capacity between 1 and 10000),
  is_active boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rocket_beta_memberships (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.rocket_beta_programs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('waitlisted','approved','declined','left')),
  updates_opt_in boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id,user_id)
);
create index rocket_beta_memberships_program_status_idx on public.rocket_beta_memberships(program_id,status);

create table public.rocket_beta_feedback (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.rocket_beta_memberships(id) on delete cascade,
  category text not null check (category in ('bug','idea','other')),
  body text not null check (char_length(body) between 5 and 2000),
  created_at timestamptz not null default now()
);
create index rocket_beta_feedback_membership_idx on public.rocket_beta_feedback(membership_id,created_at desc);

create table public.rocket_beta_updates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.rocket_beta_programs(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  subject text not null check (char_length(subject) between 3 and 120),
  body text not null check (char_length(body) between 10 and 2000),
  app_url text,
  created_at timestamptz not null default now()
);
create index rocket_beta_updates_program_time_idx on public.rocket_beta_updates(program_id,created_at desc);
create unique index rocket_beta_one_update_per_day_idx on public.rocket_beta_updates(program_id,((created_at at time zone 'utc')::date));

create table public.rocket_beta_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  update_id uuid references public.rocket_beta_updates(id) on delete cascade,
  membership_id uuid not null references public.rocket_beta_memberships(id) on delete cascade,
  kind text not null check (kind in ('joined','approved','update')),
  status text not null check (status in ('reserved','sent','delivered','bounced','complained','suppressed','failed')),
  resend_id text,
  created_at timestamptz not null default now(),
  unique (update_id,membership_id,kind)
);
create unique index rocket_beta_email_once_event_idx on public.rocket_beta_email_deliveries(membership_id,kind) where update_id is null;
create unique index rocket_beta_email_resend_idx on public.rocket_beta_email_deliveries(resend_id) where resend_id is not null;

create table public.rocket_beta_email_events (
  provider_event_id text primary key,
  delivery_id uuid not null references public.rocket_beta_email_deliveries(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now()
);

create table public.rocket_optimizer_runs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  recommendations jsonb not null default '[]'::jsonb check (jsonb_typeof(recommendations)='array'),
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index rocket_optimizer_runs_app_time_idx on public.rocket_optimizer_runs(app_id,created_at desc);
create unique index rocket_optimizer_one_run_per_day_idx on public.rocket_optimizer_runs(app_id,((created_at at time zone 'utc')::date));

create table public.rocket_optimizer_actions (
  run_id uuid not null references public.rocket_optimizer_runs(id) on delete cascade,
  recommendation_index integer not null check (recommendation_index between 0 and 6),
  status text not null check (status in ('applied','dismissed')),
  acted_by uuid not null references auth.users(id),
  acted_at timestamptz not null default now(),
  primary key (run_id,recommendation_index)
);

-- The public schema is exposed by PostgREST. No direct client access to
-- tester identity, feedback, messages or model output is permitted.
alter table public.rocket_beta_programs enable row level security;
alter table public.rocket_beta_memberships enable row level security;
alter table public.rocket_beta_feedback enable row level security;
alter table public.rocket_beta_updates enable row level security;
alter table public.rocket_beta_email_deliveries enable row level security;
alter table public.rocket_beta_email_events enable row level security;
alter table public.rocket_optimizer_runs enable row level security;
alter table public.rocket_optimizer_actions enable row level security;
revoke all on public.rocket_beta_programs,public.rocket_beta_memberships,
  public.rocket_beta_feedback,public.rocket_beta_updates,
  public.rocket_beta_email_deliveries,public.rocket_beta_email_events,public.rocket_optimizer_runs,
  public.rocket_optimizer_actions
  from public,anon,authenticated;
grant all on public.rocket_beta_programs,public.rocket_beta_memberships,
  public.rocket_beta_feedback,public.rocket_beta_updates,
  public.rocket_beta_email_deliveries,public.rocket_beta_email_events,public.rocket_optimizer_runs,
  public.rocket_optimizer_actions
  to service_role;

-- Serialize approvals on the programme row so capacity cannot be exceeded by
-- concurrent owner requests. The Edge Function performs owner authorization.
create function public.rocket_beta_change_tester_status(p_program_id uuid,p_membership_id uuid,p_status text)
returns text language plpgsql security invoker set search_path='' as $$
declare v_program public.rocket_beta_programs%rowtype; v_before text; v_approved integer;
begin
  if p_status not in ('approved','declined','left') then raise exception 'Invalid status'; end if;
  select * into v_program from public.rocket_beta_programs where id=p_program_id for update;
  if not found then raise exception 'Beta programme unavailable'; end if;
  select status into v_before from public.rocket_beta_memberships
    where id=p_membership_id and program_id=p_program_id for update;
  if not found then raise exception 'Tester unavailable'; end if;
  if p_status='approved' and v_before<>'approved' then
    if not v_program.is_active then raise exception 'Beta is inactive'; end if;
    if v_program.capacity is not null then
      select count(*) into v_approved from public.rocket_beta_memberships
        where program_id=p_program_id and status='approved';
      if v_approved>=v_program.capacity then raise exception 'Beta capacity reached'; end if;
    end if;
  end if;
  update public.rocket_beta_memberships set status=p_status,updated_at=now()
    where id=p_membership_id and program_id=p_program_id;
  return v_before;
end $$;
revoke all on function public.rocket_beta_change_tester_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rocket_beta_change_tester_status(uuid,uuid,text) to service_role;

-- Service-role only, and caller identity is checked again inside the function.
create function public.get_owned_app_developer_analytics(p_app_id uuid,p_user_id uuid,p_days integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_today date := (now() at time zone 'utc')::date;
  v_from date; v_previous_from date; v_started date; v_result jsonb;
begin
  if p_days not in (7,30,90) or not exists (
    select 1 from public.app_owners where app_id=p_app_id and user_id=p_user_id
      and revoked_at is null and verification_level='domain_verified'
  ) or not exists (
    select 1 from public.rocket_developer_memberships
      where user_id=p_user_id and status='active' and current_period_end>now()
  ) then raise exception 'Developer access required' using errcode='42501'; end if;
  v_from:=v_today-(p_days-1); v_previous_from:=v_from-p_days;
  select greatest(
    least(coalesce((select min(view_day) from app_graph.app_profile_view_events),v_today),
          coalesce((select min(click_day) from app_graph.marketplace_clicks),v_today)),
    coalesce((select discovered_at::date from public.public_apps where id=p_app_id),v_today)
  ) into v_started;
  with view_days as (
    select view_day,count(*)::integer n from app_graph.app_profile_view_events
      where app_id=p_app_id and view_day between v_previous_from and v_today group by view_day
  ), click_days as (
    select click_day,count(*)::integer n from app_graph.marketplace_clicks
      where app_id=p_app_id and click_day between v_previous_from and v_today group by click_day
  )
  select jsonb_build_object(
    'app_id',p_app_id,'days',p_days,'from',v_from,'to',v_today,
    'tracking_started',v_started,
    'views',coalesce((select sum(n) from view_days where view_day>=v_from),0),
    'outbound_clicks',coalesce((select sum(n) from click_days where click_day>=v_from),0),
    'previous_views',case when v_started<=v_previous_from then coalesce((select sum(n) from view_days where view_day<v_from),0) else null end,
    'previous_outbound_clicks',case when v_started<=v_previous_from then coalesce((select sum(n) from click_days where click_day<v_from),0) else null end,
    'daily_clicks',coalesce((select jsonb_agg(jsonb_build_object('day',v_from+i,'clicks',coalesce(c.n,0)) order by i)
      from generate_series(0,p_days-1) i left join click_days c on c.click_day=v_from+i),'[]'::jsonb),
    'public_collection_count',(select count(distinct ca.collection_id) from public.collection_apps ca
      join public.user_collections c on c.id=ca.collection_id and c.visibility='public' where ca.app_id=p_app_id),
    'review_count',(select count(*) from app_graph.app_reviews where app_id=p_app_id and status='published' and created_at>=v_from::timestamp at time zone 'utc')
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.get_owned_app_developer_analytics(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.get_owned_app_developer_analytics(uuid,uuid,integer) to service_role;

-- Apply the approved description and record the decision atomically. The
-- recommendation text comes from the stored run, never the browser request.
create function public.rocket_optimizer_apply_description(
  p_app_id uuid,p_user_id uuid,p_run_id uuid,p_index integer
) returns text language plpgsql security invoker set search_path='' as $$
declare v_run public.rocket_optimizer_runs%rowtype; v_recommendation jsonb;
  v_before text; v_current text; v_proposed text;
begin
  if p_index not between 0 and 6 or not exists (
    select 1 from public.app_owners where app_id=p_app_id and user_id=p_user_id
      and revoked_at is null and verification_level='domain_verified'
  ) or not exists (
    select 1 from public.rocket_developer_memberships
      where user_id=p_user_id and status='active' and current_period_end>now()
  ) then raise exception 'Developer access required' using errcode='42501'; end if;
  select * into v_run from public.rocket_optimizer_runs
    where id=p_run_id and app_id=p_app_id;
  if not found then raise exception 'Recommendation unavailable'; end if;
  v_recommendation:=v_run.recommendations->p_index;
  v_before:=v_run.context_snapshot->>'presentation_description';
  v_proposed:=v_recommendation->>'proposed_description';
  if v_before is null or v_proposed is null or char_length(v_proposed) not between 20 and 2000 then
    raise exception 'Description proposal unavailable';
  end if;
  select description into v_current from public.app_owner_presentations
    where app_id=p_app_id for update;
  if not found or v_current is distinct from v_before then
    raise exception 'Listing changed; run the optimizer again';
  end if;
  insert into public.rocket_optimizer_actions(run_id,recommendation_index,status,acted_by)
    values(p_run_id,p_index,'applied',p_user_id);
  update public.app_owner_presentations set description=v_proposed,
    updated_by=p_user_id,updated_at=now() where app_id=p_app_id;
  return 'applied';
end $$;
revoke all on function public.rocket_optimizer_apply_description(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.rocket_optimizer_apply_description(uuid,uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
