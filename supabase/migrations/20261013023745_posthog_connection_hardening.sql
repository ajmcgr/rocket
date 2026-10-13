-- A new OAuth grant must not inherit the previous grant's public visibility,
-- selected provider, or metric points. Keep the reset in one transaction.
create or replace function public.replace_posthog_authorization(
  p_app_id uuid, p_user_id uuid, p_region text, p_token jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_connection_id uuid;
begin
  if p_region not in ('us', 'eu')
    or length(coalesce(p_token->>'refresh_token_ciphertext', '')) < 30
    or length(coalesce(p_token->>'refresh_token_iv', '')) < 16 then
    raise exception 'Invalid PostHog authorization';
  end if;
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;

  select id into v_connection_id from public.app_data_connections
    where app_id = p_app_id and provider = 'posthog' for update;
  if v_connection_id is not null then
    delete from public.app_metric_points
      where connection_id = v_connection_id and provider = 'posthog';
  end if;
  insert into public.app_data_connections (
    app_id, owner_user_id, provider, status, posthog_region,
    property_id, property_name, stream_id, verified_hostname, time_zone,
    refresh_token_ciphertext, refresh_token_iv, last_attempted_sync,
    last_successful_sync, last_error, updated_at
  ) values (
    p_app_id, p_user_id, 'posthog', 'select_property', p_region,
    null, null, null, null, null,
    p_token->>'refresh_token_ciphertext', p_token->>'refresh_token_iv', null,
    null, null, now()
  ) on conflict (app_id, provider) do update set
    owner_user_id = excluded.owner_user_id,
    status = excluded.status, posthog_region = excluded.posthog_region,
    property_id = null, property_name = null, stream_id = null,
    verified_hostname = null, time_zone = null,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    refresh_token_iv = excluded.refresh_token_iv,
    last_attempted_sync = null, last_successful_sync = null,
    last_error = null, updated_at = now();

  update public.app_metric_visibility set visibility = 'private',
    external_marketing_allowed = false, updated_at = now()
    where app_id = p_app_id and provider = 'posthog';
  update public.app_provider_selection set analytics_provider = null,
    updated_at = now() where app_id = p_app_id and analytics_provider = 'posthog';
  delete from public.public_app_traction
    where app_id = p_app_id and provider = 'posthog';
end;
$$;
revoke all on function public.replace_posthog_authorization(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_posthog_authorization(uuid,uuid,text,jsonb)
  to service_role;

-- Disconnect also resets visibility and the active choice atomically. A
-- reconnect therefore always needs a fresh owner opt-in before public display.
create or replace function public.disconnect_posthog_authorization(
  p_app_id uuid, p_user_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null for update;
  if not found then raise exception 'An app owner is required'; end if;
  update public.app_data_connections set status = 'disconnected',
    refresh_token_ciphertext = null, refresh_token_iv = null,
    last_attempted_sync = null, last_successful_sync = null,
    last_error = null, updated_at = now()
    where app_id = p_app_id and owner_user_id = p_user_id
      and provider = 'posthog';
  update public.app_metric_visibility set visibility = 'private',
    external_marketing_allowed = false, updated_at = now()
    where app_id = p_app_id and provider = 'posthog';
  update public.app_provider_selection set analytics_provider = null,
    updated_at = now() where app_id = p_app_id and analytics_provider = 'posthog';
  delete from public.public_app_traction
    where app_id = p_app_id and provider = 'posthog';
  update public.app_data_oauth_states set consumed_at = now()
    where app_id = p_app_id and user_id = p_user_id
      and provider = 'posthog' and consumed_at is null;
end;
$$;
revoke all on function public.disconnect_posthog_authorization(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_posthog_authorization(uuid,uuid)
  to service_role;
