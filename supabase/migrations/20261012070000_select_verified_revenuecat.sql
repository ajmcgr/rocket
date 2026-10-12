-- Switching back to an already mapped RevenueCat source never creates a new
-- revenue snapshot. The existing verified production point must still be fresh.
create function public.activate_verified_revenuecat(
  p_app_id uuid, p_owner_user_id uuid, p_expected_previous text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_previous text;
begin
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
      and s.provider = 'revenuecat' and c.owner_user_id = p_owner_user_id
      and c.provider = 'revenuecat' and c.status = 'active'
      and c.last_successful_sync > now() - interval '72 hours'
      and s.last_successful_sync > now() - interval '72 hours'
      and p.provider = 'revenuecat' and p.metric_type = 'gross_revenue_30d'
      and p.external_account_id = s.external_account_id
      and p.external_app_id = s.external_app_id
      and p.source_environment = 'production'
      and p.verified_at > now() - interval '72 hours'
  ) then raise exception 'Sync mapped RevenueCat revenue before selecting it'; end if;
  perform public.set_app_provider_selection(p_app_id, p_owner_user_id,
    'revenue', 'revenuecat');
end;
$$;
revoke all on function public.activate_verified_revenuecat(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.activate_verified_revenuecat(uuid,uuid,text)
  to service_role;
