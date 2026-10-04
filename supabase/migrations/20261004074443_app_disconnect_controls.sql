-- Called only by an authenticated Edge Function with the server-derived user ID.
-- No public listing, payment, entitlement, metric history or Stripe account is deleted.
create function public.manage_app_disconnection(p_app_id uuid, p_user_id uuid, p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_owned boolean; v_ga boolean; v_ph boolean; v_revenue boolean; v_payments boolean;
begin
  perform 1 from public.app_owners where app_id=p_app_id and user_id=p_user_id
    and revoked_at is null for update;
  v_owned := found;
  if not v_owned then
    perform 1 from public.app_claims where app_id=p_app_id and user_id=p_user_id
      and status in ('pending','review') for update;
    if not found then raise exception 'App is not connected to your account'; end if;
    if p_action not in ('status','app') then raise exception 'Active app ownership required'; end if;
  end if;
  select exists(select 1 from public.app_data_connections where app_id=p_app_id and owner_user_id=p_user_id and provider='ga4' and status<>'disconnected'),
    exists(select 1 from public.app_data_connections where app_id=p_app_id and owner_user_id=p_user_id and provider='posthog' and status<>'disconnected'),
    exists(select 1 from public.app_revenue_bindings where app_id=p_app_id and owner_user_id=p_user_id),
    exists(select 1 from public.connect_developer_accounts a join public.rocket_oauth_clients c using(client_id)
      where c.app_id=p_app_id and a.developer_user_id=p_user_id and a.is_current)
    into v_ga,v_ph,v_revenue,v_payments;
  if p_action='status' then
    return jsonb_build_object('ga4',v_ga,'posthog',v_ph,'stripe_revenue',v_revenue,'stripe_payments',v_payments);
  elsif p_action='posthog' then
    perform 1 from public.app_data_connections c where c.app_id=p_app_id and c.provider='posthog' for update;
    if exists(select 1 from public.app_data_connections c where c.app_id=p_app_id and c.provider='posthog'
      and (to_jsonb(c)->>'sync_locked_until')::timestamptz>now()) then
      raise exception 'PostHog is syncing. Please retry shortly';
    end if;
    update public.app_data_connections set status='disconnected',refresh_token_ciphertext=null,
      refresh_token_iv=null,last_error=null,updated_at=now()
      where app_id=p_app_id and owner_user_id=p_user_id and provider='posthog';
    delete from public.public_app_traction where app_id=p_app_id and provider='posthog';
    update public.app_data_oauth_states s set consumed_at=now() where app_id=p_app_id and user_id=p_user_id and consumed_at is null and to_jsonb(s)->>'provider'='posthog';
  elsif p_action='stripe_payments' then
    -- Lock clients/accounts before checking: never strand existing buyers or open checkouts.
    perform 1 from public.rocket_oauth_clients where app_id=p_app_id for update;
    perform 1 from public.connect_developer_accounts a join public.rocket_oauth_clients c using(client_id)
      where c.app_id=p_app_id and a.developer_user_id=p_user_id for update of a;
    if exists(select 1 from public.connect_transactions t join public.rocket_oauth_clients c using(client_id) where c.app_id=p_app_id)
      or exists(select 1 from public.connect_entitlements e join public.rocket_oauth_clients c using(client_id) where c.app_id=p_app_id)
      or exists(select 1 from public.connect_checkout_attempts t join public.rocket_oauth_clients c using(client_id)
        where c.app_id=p_app_id and t.expires_at>now()) then
      raise exception 'This app has purchases or open checkouts. Contact support to disconnect Stripe safely without disrupting customers';
    end if;
    update public.connect_products p set is_active=false,updated_at=now()
      from public.rocket_oauth_clients c where p.client_id=c.client_id and c.app_id=p_app_id and p.developer_user_id=p_user_id;
    update public.connect_developer_accounts a set is_current=false,status='disabled',charges_enabled=false,payouts_enabled=false,updated_at=now()
      from public.rocket_oauth_clients c where a.client_id=c.client_id and c.app_id=p_app_id and a.developer_user_id=p_user_id;
  elsif p_action='app' then
    if v_owned then
      if v_ga or v_ph or v_revenue or v_payments then raise exception 'Disconnect this app’s integrations before disconnecting the app'; end if;
      perform 1 from public.rocket_oauth_clients where app_id=p_app_id for update;
      if exists(select 1 from public.connect_transactions t join public.rocket_oauth_clients c using(client_id) where c.app_id=p_app_id)
        or exists(select 1 from public.connect_entitlements e join public.rocket_oauth_clients c using(client_id) where c.app_id=p_app_id)
        or exists(select 1 from public.connect_checkout_attempts t join public.rocket_oauth_clients c using(client_id) where c.app_id=p_app_id and t.expires_at>now())
        or exists(select 1 from public.rocket_oauth_authorizations a join public.rocket_oauth_clients c using(client_id)
          where c.app_id=p_app_id and a.revoked_at is null) then
        raise exception 'This app has customers or connected Rocket ID users. Contact support to unlink it safely';
      end if;
      update public.rocket_oauth_clients set is_active=false where app_id=p_app_id and created_by=p_user_id;
      update public.app_owners set revoked_at=now() where app_id=p_app_id and user_id=p_user_id and revoked_at is null;
    end if;
    update public.app_claims set status='revoked',revoked_at=now() where app_id=p_app_id and user_id=p_user_id and status<>'revoked';
    update public.app_verification_challenges set status='expired' where app_id=p_app_id and user_id=p_user_id and status='pending';
    update public.app_data_oauth_states set consumed_at=now() where app_id=p_app_id and user_id=p_user_id and consumed_at is null;
    update public.app_revenue_oauth_states set consumed_at=now() where app_id=p_app_id and user_id=p_user_id and consumed_at is null;
  else raise exception 'Unknown disconnect action';
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.manage_app_disconnection(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.manage_app_disconnection(uuid,uuid,text) to service_role;
