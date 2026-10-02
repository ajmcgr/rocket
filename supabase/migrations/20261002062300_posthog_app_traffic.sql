-- Independent provider consent; credentials/raw points remain service-only.
alter table public.app_data_connections drop constraint app_data_connections_provider_check;
alter table public.app_data_connections add constraint app_data_connections_provider_check check (provider in ('ga4','posthog'));
alter table public.app_data_connections add column posthog_region text check (posthog_region in ('us','eu'));
alter table public.app_data_connections add column sync_locked_until timestamptz;
alter table public.app_metric_points drop constraint app_metric_points_provider_check;
alter table public.app_metric_points add constraint app_metric_points_provider_check check (provider in ('ga4','posthog'));
alter table public.public_app_traction drop constraint public_app_traction_provider_check;
alter table public.public_app_traction add constraint public_app_traction_provider_check check (provider in ('ga4','posthog'));
alter table public.app_metric_visibility add column provider text not null default 'ga4' check (provider in ('ga4','posthog'));
alter table public.app_metric_visibility drop constraint app_metric_visibility_pkey;
alter table public.app_metric_visibility add primary key (app_id,provider,metric_type);
alter table public.public_app_traction drop constraint public_app_traction_pkey;
alter table public.public_app_traction add primary key (app_id,provider,metric_type);
alter table public.app_data_oauth_states add column provider text not null default 'ga4' check (provider in ('ga4','posthog'));
alter table public.app_data_oauth_states add column posthog_region text check (posthog_region in ('us','eu'));

create or replace function public.consume_app_data_oauth_state(p_state_hash text)
returns table(app_id uuid,user_id uuid,pkce_verifier text)
language plpgsql security invoker set search_path='' as $$
begin
  return query update public.app_data_oauth_states s set consumed_at=now()
    where s.state_hash=p_state_hash and s.provider='ga4' and s.consumed_at is null and s.expires_at>now()
    returning s.app_id,s.user_id,s.pkce_verifier;
end; $$;
create function public.consume_posthog_oauth_state(p_state_hash text)
returns table(app_id uuid,user_id uuid,pkce_verifier text,posthog_region text)
language plpgsql security invoker set search_path='' as $$
begin
  return query update public.app_data_oauth_states s set consumed_at=now()
    where s.state_hash=p_state_hash and s.provider='posthog' and s.consumed_at is null and s.expires_at>now()
    returning s.app_id,s.user_id,s.pkce_verifier,s.posthog_region;
end; $$;
revoke all on function public.consume_posthog_oauth_state(text) from public,anon,authenticated;
grant execute on function public.consume_posthog_oauth_state(text) to service_role;

-- Lock the owner and existing connection while storing a new grant. This makes
-- revocation/transfer and reconnect atomic and resets publishing consent.
create function public.store_posthog_grant(p_app_id uuid,p_user_id uuid,p_region text,p_ciphertext text,p_iv text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_connection public.app_data_connections%rowtype;
begin
  perform 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=p_user_id
    and o.revoked_at is null and o.verification_level='domain_verified' for update;
  if not found then raise exception 'Owner verification changed'; end if;
  select * into v_connection from public.app_data_connections c
    where c.app_id=p_app_id and c.provider='posthog' for update;
  if v_connection.sync_locked_until>now() then raise exception 'Connection busy'; end if;
  insert into public.app_data_connections(app_id,owner_user_id,provider,status,posthog_region,refresh_token_ciphertext,refresh_token_iv)
    values(p_app_id,p_user_id,'posthog','select_property',p_region,p_ciphertext,p_iv)
    on conflict(app_id,provider) do update set owner_user_id=p_user_id,status='select_property',posthog_region=p_region,
      refresh_token_ciphertext=p_ciphertext,refresh_token_iv=p_iv,property_id=null,property_name=null,stream_id=null,
      verified_hostname=null,time_zone=null,last_successful_sync=null,last_error=null,sync_locked_until=null,updated_at=now();
  update public.app_metric_visibility set visibility='private',updated_at=now() where app_id=p_app_id and provider='posthog';
  delete from public.public_app_traction where app_id=p_app_id and provider='posthog';
end; $$;
revoke all on function public.store_posthog_grant(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.store_posthog_grant(uuid,uuid,text,text,text) to service_role;

create function public.app_traction_is_currently_public(p_app_id uuid,p_metric_type text,p_visibility text,p_provider text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.app_metric_visibility v
    join public.app_data_connections c on c.app_id=v.app_id and c.provider=v.provider
    join public.app_owners o on o.app_id=v.app_id and o.user_id=c.owner_user_id
    where v.app_id=p_app_id and v.metric_type=p_metric_type and v.provider=p_provider
      and v.visibility=p_visibility and v.visibility<>'private'
      and c.status='active' and c.last_successful_sync>now()-interval '72 hours'
      and o.revoked_at is null and o.verification_level='domain_verified');
$$;
revoke all on function public.app_traction_is_currently_public(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.app_traction_is_currently_public(uuid,text,text,text) to anon,authenticated;
drop policy "Read consented app traction" on public.public_app_traction;
create policy "Read consented app traction" on public.public_app_traction for select to anon,authenticated
using (last_verified_at>now()-interval '72 hours'
  and public.app_traction_is_currently_public(app_id,metric_type,visibility,provider)
  and exists(select 1 from public.public_apps a where a.id=app_id));

create or replace function public.refresh_app_traction_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  delete from public.public_app_traction where app_id=p_app_id;
  insert into public.public_app_traction (app_id,metric_type,visibility,value,value_range,metric_date,provider,last_verified_at)
  select p_app_id,v.metric_type,v.visibility,
    case when v.visibility='exact' then p.metric_value end,
    case when v.visibility='range' then case when p.metric_value=0 then '0'
      when p.metric_value<100 then '1–99' when p.metric_value<1000 then '100–999'
      when p.metric_value<10000 then '1K–9.9K' when p.metric_value<100000 then '10K–99.9K' else '100K+' end end,
    p.metric_date,c.provider,c.last_successful_sync
  from public.app_metric_visibility v
  join public.app_data_connections c on c.app_id=v.app_id and c.provider=v.provider
  join lateral (select q.* from public.app_metric_points q where q.connection_id=c.id
    and q.provider=c.provider and q.metric_type=v.metric_type and q.verification_status='verified'
    order by q.metric_date desc limit 1) p on true
  where v.app_id=p_app_id and v.visibility<>'private' and c.status='active'
    and c.last_successful_sync>now()-interval '72 hours'
    and exists(select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=c.owner_user_id
      and o.revoked_at is null and o.verification_level='domain_verified')
    and exists(select 1 from app_graph.apps a where a.id=p_app_id and a.is_public);
end; $$;
