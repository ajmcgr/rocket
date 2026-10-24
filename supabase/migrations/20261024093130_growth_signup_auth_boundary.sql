-- Preserve invoker security and protected auth.users permissions.
-- Replace the internal service-only RPC with verified auth metadata input.
drop function public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid);
create function public.record_rocket_growth_event(p_event_id uuid,p_event_name text,p_target_kind text,p_identifier text,
  p_method text,p_visitor_hash text,p_user_id uuid default null,p_referral_id uuid default null,p_account_created_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare target text; ref app_graph.rocket_growth_events; inserted integer;
begin
  if p_event_id is null or p_event_name is null or p_event_name not in ('share_action','referral_visit','referral_signup')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid growth event'; end if;
  if p_event_name='referral_signup' then
    -- Only service_role can invoke this function. The Edge Function supplies
    -- creation time from auth.getUser(token), never from the request body.
    if p_user_id is null or p_referral_id is null or p_account_created_at is null then raise exception 'Confirmed account required'; end if;
    if p_account_created_at>now() then return false; end if;
    select * into ref from app_graph.rocket_growth_events where event_id=p_referral_id and event_name='referral_visit'
      and created_at>=now()-interval '7 days' and created_at<=p_account_created_at;
    if not found or p_account_created_at<ref.created_at then return false; end if;
    p_target_kind:=ref.target_kind; target:=ref.target_id; p_method:=null;
  else
    if p_user_id is not null or p_referral_id is not null or p_account_created_at is not null or p_target_kind is null or p_identifier is null
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
revoke all on function public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid,timestamptz) to service_role;

