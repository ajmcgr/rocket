-- PostHog OAuth callbacks are one-use and cannot consume a GA4 state.
create or replace function public.consume_posthog_oauth_state(p_state_hash text)
returns table(app_id uuid, user_id uuid, pkce_verifier text, posthog_region text)
language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.app_data_oauth_states s set consumed_at = now()
    where s.state_hash = p_state_hash and s.provider = 'posthog'
      and s.consumed_at is null and s.expires_at > now()
    returning s.app_id, s.user_id, s.pkce_verifier, s.posthog_region;
end;
$$;
revoke all on function public.consume_posthog_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_posthog_oauth_state(text) to service_role;

-- The switch and removal of the old projection commit together. A stale
-- browser or an empty/unverified first sync cannot replace GA4.
create function public.activate_verified_posthog(
  p_app_id uuid, p_owner_user_id uuid, p_expected_previous text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_previous text;
begin
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_owner_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select analytics_provider into v_previous from public.app_provider_selection
    where app_id = p_app_id for update;
  if v_previous is distinct from p_expected_previous then
    raise exception 'Provider choice changed; reload and try again';
  end if;
  if not exists (
    select 1 from public.app_data_connections c
    join public.app_metric_points p on p.connection_id = c.id
    where c.app_id = p_app_id and c.owner_user_id = p_owner_user_id
      and c.provider = 'posthog' and c.status = 'active'
      and c.property_id is not null and c.verified_hostname is not null
      and c.last_successful_sync > now() - interval '72 hours'
      and p.provider = 'posthog' and p.metric_type = 'views'
      and p.property_id = c.property_id
      and p.verified_hostname = c.verified_hostname
      and p.metric_date >= (now() at time zone 'UTC')::date - 2
      and p.metric_value > 0 and p.verification_status = 'verified'
      and p.observed_through > now() - interval '72 hours'
  ) then raise exception 'Complete a real PostHog sync before switching'; end if;
  perform public.set_app_provider_selection(p_app_id, p_owner_user_id,
    'analytics', 'posthog');
end;
$$;
revoke all on function public.activate_verified_posthog(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_posthog(uuid,uuid,text)
  to service_role;

-- Cache only the selected source. The public RLS check repeats this check
-- at read time, so privacy changes still fail closed before cache refresh.
create or replace function public.refresh_app_traction_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.public_app_traction where app_id = p_app_id;
  insert into public.public_app_traction
    (app_id,metric_type,visibility,value,value_range,metric_date,provider,last_verified_at)
  select p_app_id,v.metric_type,v.visibility,
    case when v.visibility='exact' then p.metric_value end,
    case when v.visibility='range' then case when p.metric_value=0 then '0'
      when p.metric_value<100 then '1–99' when p.metric_value<1000 then '100–999'
      when p.metric_value<10000 then '1K–9.9K' when p.metric_value<100000 then '10K–99.9K' else '100K+' end end,
    p.metric_date,c.provider,c.last_successful_sync
  from public.app_metric_visibility v
  join public.app_data_connections c on c.app_id=v.app_id and c.provider=v.provider
  join public.app_provider_selection s on s.app_id=v.app_id
    and s.owner_user_id=c.owner_user_id and s.analytics_provider=c.provider
  join lateral (select q.* from public.app_metric_points q where q.connection_id=c.id
    and q.provider=c.provider and q.metric_type=v.metric_type and q.verification_status='verified'
    order by q.metric_date desc limit 1) p on true
  where v.app_id=p_app_id and v.visibility<>'private' and c.status='active'
    and c.last_successful_sync>now()-interval '72 hours'
    and exists(select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=c.owner_user_id
      and o.revoked_at is null and o.verification_level='domain_verified')
    and exists(select 1 from app_graph.apps a where a.id=p_app_id and a.is_public);
end;
$$;
