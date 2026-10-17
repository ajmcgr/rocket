-- Freeze the selected entitlement before Stripe HTTP begins. The same client
-- advisory lock is used by connect_guard_offer, so an edit either completes
-- first (and checkout fails its snapshot check), or sees a recorded attempt.
create function public.connect_freeze_checkout(
  p_user_id uuid,p_client_id text,p_product_id uuid,p_account text,
  p_key text,p_entitlement_key text,p_origin text,p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_client_id,9817));
  if length(p_key) not between 1 and 255 or p_expires_at<=now() or not exists(
    select 1 from connect_products p
    join connect_developer_accounts a on a.id=p.developer_account_id
    join rocket_oauth_clients c on c.client_id=p.client_id
    join rocket_buy_configuration config on config.singleton
    where p.id=p_product_id and p.client_id=p_client_id and p.entitlement_key=p_entitlement_key
      and p.is_active and p.activated_at is not null and p.platform_fee_bps=500
      and a.stripe_account_id=p_account and a.is_current and a.developer_user_id=c.created_by
      and p.developer_user_id=c.created_by and c.created_by<>p_user_id
      and c.environment='production' and c.is_active and can_monetize_rocket_app(c.created_by,c.app_id)
      and config.live_checkout_enabled and config.platform_fee_bps=500
      and (config.multi_plan_enabled or (select count(*) from connect_products where client_id=p_client_id and is_active)=1)
  ) then return false; end if;
  insert into connect_checkout_attempts(user_id,client_id,product_id,stripe_account_id,idempotency_key,origin,expires_at)
    values(p_user_id,p_client_id,p_product_id,p_account,p_key,p_origin,p_expires_at)
    on conflict(idempotency_key) do nothing;
  return exists(select 1 from connect_checkout_attempts where idempotency_key=p_key and user_id=p_user_id
    and client_id=p_client_id and product_id=p_product_id and stripe_account_id=p_account);
end $$;
revoke all on function public.connect_freeze_checkout(uuid,text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.connect_freeze_checkout(uuid,text,uuid,text,text,text,text,timestamptz) to service_role;
