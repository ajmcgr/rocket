-- Avoid a PL/pgSQL record/table-alias collision discovered by the isolated
-- payment-ledger test. This replaces only the reporting RPC.
create or replace function public.rocket_record_marketplace_payment(
  p_transaction_id uuid,p_payment_key text,p_invoice_id text,p_payment_intent_id text,
  p_amount_cents bigint,p_fee_cents bigint,p_currency text,p_paid_at timestamptz,p_source_event_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_transaction record; v_id uuid; v_mode boolean; v_origin text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select tx.*,c.app_id,c.environment,a.id as merchant_id,p.currency as offer_currency,
    p.platform_fee_bps,att.origin as attempt_origin into v_transaction
  from public.connect_transactions tx
  join public.rocket_oauth_clients c on c.client_id=tx.client_id
  join public.connect_developer_accounts a on a.id=tx.developer_account_id and a.stripe_account_id=tx.stripe_account_id
  join public.connect_products p on p.id=tx.product_id and p.client_id=tx.client_id
  left join public.connect_checkout_attempts att on att.stripe_checkout_session_id=tx.stripe_checkout_session_id
  where tx.id=p_transaction_id;
  if v_transaction.id is null or v_transaction.app_id is null or p_payment_key is null
    or (p_payment_key is distinct from p_invoice_id and p_payment_key is distinct from p_payment_intent_id)
    or p_amount_cents <= 0 or lower(p_currency) <> lower(v_transaction.currency)
    or lower(p_currency) <> lower(v_transaction.offer_currency)
    or p_fee_cents <> round(p_amount_cents * v_transaction.platform_fee_bps / 10000.0) then
    raise exception 'Unverified marketplace payment';
  end if;
  v_mode := v_transaction.environment='production';
  v_origin := coalesce(v_transaction.attempt_origin,'UNKNOWN');
  insert into investor_private.marketplace_payments(stripe_account_id,payment_key,stripe_invoice_id,stripe_payment_intent_id,
    transaction_id,app_id,offer_id,buyer_user_id,merchant_account_id,livemode,amount_cents,application_fee_cents,
    currency,origin,paid_at,source_event_id)
  values(v_transaction.stripe_account_id,p_payment_key,p_invoice_id,p_payment_intent_id,v_transaction.id,
    v_transaction.app_id,v_transaction.product_id,v_transaction.user_id,v_transaction.merchant_id,
    v_mode,p_amount_cents,p_fee_cents,lower(p_currency),v_origin,p_paid_at,p_source_event_id)
  on conflict(stripe_account_id,livemode,payment_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from investor_private.marketplace_payments
      where stripe_account_id=v_transaction.stripe_account_id and livemode=v_mode and payment_key=p_payment_key
      and transaction_id=v_transaction.id and amount_cents=p_amount_cents and application_fee_cents=p_fee_cents;
  end if;
  if v_id is null then raise exception 'Marketplace ledger conflict'; end if;
  return v_id;
end; $$;
