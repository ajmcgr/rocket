-- Catalogue cards are current app states, independent of the selected event period.
-- Replace only the three placeholders; retain the snapshot's admin gate and all
-- previously patched metrics.
do $patch$
declare definition text;
  placeholder text := '''rocket_id_connected'',null,''buy_enabled'',null,''usage_verified'',null';
begin
  definition := pg_get_functiondef('public.rocket_admin_snapshot(text,text)'::regprocedure);
  if strpos(definition, placeholder) = 0 then
    raise exception 'Expected catalogue placeholders missing; inspect snapshot before applying';
  end if;
  execute replace(definition, placeholder, $counts$
        'rocket_id_connected',(select count(distinct c.app_id)
          from public.rocket_oauth_clients c
          join public.rocket_oauth_authorizations a on a.client_id=c.client_id and a.revoked_at is null
          join public.app_owners o on o.app_id=c.app_id and o.user_id=c.created_by and o.revoked_at is null
          where c.environment='production' and c.is_active),
        'buy_enabled',(select count(distinct c.app_id)
          from public.rocket_oauth_clients c
          join public.connect_developer_accounts d on d.client_id=c.client_id
            and d.developer_user_id=c.created_by and d.is_current and d.status='active'
            and d.charges_enabled and d.payouts_enabled
          join public.connect_products p on p.client_id=c.client_id
            and p.developer_account_id=d.id and p.developer_user_id=c.created_by
            and p.is_active and p.activated_at is not null
          join public.rocket_buy_configuration config on config.singleton
            and config.live_checkout_enabled and p.platform_fee_bps=config.platform_fee_bps
          where c.environment='production' and c.is_active and c.app_id is not null
            and 'entitlements:read'=any(c.allowed_scopes)
            and public.can_monetize_rocket_app(c.created_by,c.app_id)
            and (coalesce(p.billing_type,'subscription')<>'one_time'
              or (p.product_key is not null and cardinality(p.checkout_return_uris)>0))),
        'usage_verified',(select count(distinct c.app_id)
          from public.app_data_connections c
          join public.app_metric_points m on m.connection_id=c.id and m.app_id=c.app_id
            and m.metric_type='active_users' and m.verification_status='verified'
          join public.app_owners o on o.app_id=c.app_id and o.user_id=c.owner_user_id
            and o.revoked_at is null and o.verification_level='domain_verified'
          where c.status='active' and c.last_successful_sync is not null)
  $counts$);
end;
$patch$;
