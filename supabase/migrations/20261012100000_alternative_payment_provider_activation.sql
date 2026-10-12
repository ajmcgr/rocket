-- RevenueCat's existing binding is unchanged. Polar and Dodo use the same
-- service-only evidence contract, with different provider-native metrics.
alter table public.app_verified_revenue_points
  drop constraint app_verified_revenue_points_metric_type_check;
alter table public.app_verified_revenue_points
  add constraint app_verified_revenue_points_metric_type_check
  check (metric_type in ('gross_revenue_30d', 'subscription_mrr', 'paid_volume_30d'));
alter table public.public_app_verified_revenue
  drop constraint public_app_verified_revenue_metric_type_check;
alter table public.public_app_verified_revenue
  add constraint public_app_verified_revenue_metric_type_check
  check (metric_type in ('gross_revenue_30d', 'subscription_mrr', 'paid_volume_30d'));

create function public.bind_app_verified_payment_source(
  p_app_id uuid, p_user_id uuid, p_connection_id uuid,
  p_provider text, p_external_account_id text, p_external_app_id text,
  p_product_ids text[], p_metric_type text, p_value_minor numeric,
  p_currency text, p_period_start date, p_period_end date,
  p_expected_previous text, p_confirm_switch boolean
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_mapping_version integer; v_verified_at timestamptz := now();
  v_previous text;
begin
  if p_provider not in ('polar','dodo')
    or (p_provider = 'polar' and p_metric_type is distinct from 'gross_revenue_30d')
    or (p_provider = 'dodo' and p_metric_type is distinct from 'paid_volume_30d')
    or length(p_external_account_id) not between 3 and 255
    or length(p_external_app_id) not between 3 and 255
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 1000
    or p_currency <> 'USD' or p_value_minor is null
    or p_value_minor < 0 or p_value_minor <> trunc(p_value_minor)
    or p_value_minor > 100000000000000
    or p_period_start is null or p_period_end is null
    or p_period_end <> (v_verified_at at time zone 'UTC')::date - 1
    or p_period_start <> p_period_end - 29 then
    raise exception 'Invalid verified payment source';
  end if;
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select revenue_provider into v_previous from public.app_provider_selection
    where app_id = p_app_id for update;
  if v_previous is distinct from p_expected_previous then
    raise exception 'Revenue provider changed; reload and try again';
  end if;
  if v_previous is not null and v_previous <> p_provider
    and p_confirm_switch is not true then
    raise exception 'Confirm the revenue provider switch';
  end if;
  perform 1 from public.app_verified_revenue_connections c
    where c.id = p_connection_id and c.owner_user_id = p_user_id
      and c.provider = p_provider and c.status = 'active'
      and c.access_token_ciphertext is not null for update;
  if not found then raise exception 'Connect provider first'; end if;
  insert into public.app_verified_revenue_sources
    (app_id, connection_id, owner_user_id, provider, external_account_id,
      external_app_id, product_ids, last_attempted_sync, last_successful_sync)
  values (p_app_id, p_connection_id, p_user_id, p_provider,
    p_external_account_id, p_external_app_id, p_product_ids,
    v_verified_at, v_verified_at)
  on conflict (app_id) do update set
    connection_id = excluded.connection_id, owner_user_id = excluded.owner_user_id,
    provider = excluded.provider, external_account_id = excluded.external_account_id,
    external_app_id = excluded.external_app_id, product_ids = excluded.product_ids,
    mapping_version = public.app_verified_revenue_sources.mapping_version + 1,
    visibility = 'private', last_attempted_sync = v_verified_at,
    last_successful_sync = v_verified_at, updated_at = v_verified_at;
  select mapping_version into v_mapping_version from public.app_verified_revenue_sources
    where app_id = p_app_id and owner_user_id = p_user_id for update;
  insert into public.app_verified_revenue_points
    (app_id, connection_id, owner_user_id, provider, external_account_id,
      external_app_id, product_ids, mapping_version, metric_type, value_minor,
      currency, period_start, period_end, observed_at, verified_at,
      calculation_version, source_environment)
  values (p_app_id, p_connection_id, p_user_id, p_provider,
    p_external_account_id, p_external_app_id, p_product_ids, v_mapping_version,
    p_metric_type, p_value_minor, p_currency, p_period_start, p_period_end,
    v_verified_at, v_verified_at, 1, 'production');
  update public.app_verified_revenue_connections set status = 'active',
    last_successful_sync = v_verified_at, last_error = null, updated_at = v_verified_at
    where id = p_connection_id and owner_user_id = p_user_id;
  perform public.set_app_provider_selection(p_app_id, p_user_id, 'revenue', p_provider);
  delete from public.public_app_verified_revenue where app_id = p_app_id;
end;
$$;

-- The existing Rocket internal sync secret authenticates this server-to-server
-- request. The function itself revalidates each owner and mapped provider.
select cron.schedule('rocket-alternative-revenue-daily-sync', '30 3 * * *',
  $$select net.http_post(
    url := 'https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-alternative-revenue',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-rocket-revenue-sync', (select decrypted_secret from vault.decrypted_secrets
        where name = 'rocket_posthog_sync_secret')),
    body := jsonb_build_object('action', 'scheduled_sync', 'provider', 'polar'),
    timeout_milliseconds := 30000
  );$$);
revoke all on function public.bind_app_verified_payment_source(uuid,uuid,uuid,text,text,text,text[],text,numeric,text,date,date,text,boolean)
  from public, anon, authenticated;
grant execute on function public.bind_app_verified_payment_source(uuid,uuid,uuid,text,text,text,text[],text,numeric,text,date,date,text,boolean)
  to service_role;

create function public.activate_verified_alternative_revenue(
  p_app_id uuid, p_owner_user_id uuid, p_provider text, p_expected_previous text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_previous text;
begin
  if p_provider not in ('polar','dodo') then raise exception 'Invalid revenue provider'; end if;
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_owner_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select revenue_provider into v_previous from public.app_provider_selection
    where app_id = p_app_id for update;
  if v_previous is distinct from p_expected_previous then
    raise exception 'Provider choice changed; reload and try again';
  end if;
  if not exists (
    select 1 from public.app_verified_revenue_sources s
    join public.app_verified_revenue_connections c on c.id = s.connection_id
    join public.app_verified_revenue_points p on p.app_id = s.app_id
      and p.connection_id = s.connection_id and p.mapping_version = s.mapping_version
    where s.app_id = p_app_id and s.owner_user_id = p_owner_user_id
      and s.provider = p_provider and c.owner_user_id = p_owner_user_id
      and c.provider = p_provider and c.status = 'active'
      and c.last_successful_sync > now() - interval '72 hours'
      and s.last_successful_sync > now() - interval '72 hours'
      and p.provider = p_provider and p.metric_type = case p_provider
        when 'polar' then 'gross_revenue_30d' else 'paid_volume_30d' end
      and p.external_account_id = s.external_account_id
      and p.external_app_id = s.external_app_id
      and p.product_ids = s.product_ids
      and p.source_environment = 'production'
      and p.verified_at > now() - interval '72 hours'
  ) then raise exception 'Sync mapped live revenue before selecting it'; end if;
  perform public.set_app_provider_selection(p_app_id, p_owner_user_id,
    'revenue', p_provider);
end;
$$;
revoke all on function public.activate_verified_alternative_revenue(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_alternative_revenue(uuid,uuid,text,text)
  to service_role;

create or replace function public.disconnect_app_verified_revenue(p_app_id uuid, p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_connection_id uuid; v_selected text; v_source_provider text;
begin
  perform 1 from public.app_owners o where o.app_id = p_app_id and o.user_id = p_user_id
    and o.revoked_at is null and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select connection_id, provider into v_connection_id, v_source_provider
    from public.app_verified_revenue_sources
    where app_id = p_app_id and owner_user_id = p_user_id for update;
  if v_connection_id is null then raise exception 'Revenue source unavailable'; end if;
  select revenue_provider into v_selected from public.app_provider_selection
    where app_id = p_app_id for update;
  delete from public.public_app_verified_revenue where app_id = p_app_id;
  delete from public.app_verified_revenue_sources where app_id = p_app_id;
  if v_selected = v_source_provider then
    perform public.set_app_provider_selection(p_app_id, p_user_id, 'revenue', null);
  end if;
  if not exists (select 1 from public.app_verified_revenue_sources where connection_id = v_connection_id) then
    update public.app_verified_revenue_connections set status = 'disconnected',
      access_token_ciphertext = null, access_token_iv = null,
      refresh_token_ciphertext = null, refresh_token_iv = null,
      access_token_expires_at = null, updated_at = now()
      where id = v_connection_id and owner_user_id = p_user_id;
  end if;
end;
$$;
