-- Owner-only commerce reporting. The immutable payment ledger supplies renewals;
-- older paid transactions without a ledger row remain visible as partial data.
create function public.get_owned_buy_sales(p_app_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.rocket_oauth_clients c
    where c.app_id = p_app_id and c.created_by = p_user_id and c.environment = 'production'
  ) then
    raise exception 'Merchant access denied' using errcode = '42501';
  end if;

  with ledger as (
    select mp.id::text as payment_id, mp.offer_id, mp.paid_at,
      mp.amount_cents, mp.application_fee_cents, mp.currency,
      coalesce(sum(case when ma.kind = 'REFUND' then ma.amount_cents
                        when ma.kind = 'REVERSAL' then -ma.amount_cents else 0 end), 0) as refund_cents,
      false as legacy
    from investor_private.marketplace_payments mp
    join public.connect_developer_accounts merchant on merchant.id = mp.merchant_account_id
    left join investor_private.marketplace_adjustments ma on ma.payment_id = mp.id
    where mp.app_id = p_app_id and mp.livemode and merchant.developer_user_id = p_user_id
    group by mp.id
  ), legacy as (
    select tx.id::text as payment_id, tx.product_id as offer_id, tx.created_at as paid_at,
      tx.amount_cents::bigint, tx.application_fee_cents::bigint, tx.currency,
      case when tx.status = 'refunded' then tx.amount_cents::bigint else 0::bigint end as refund_cents,
      true as legacy
    from public.connect_transactions tx
    join public.rocket_oauth_clients client on client.client_id = tx.client_id
    join public.connect_developer_accounts merchant on merchant.id = tx.developer_account_id
    where client.app_id = p_app_id and client.created_by = p_user_id
      and client.environment = 'production' and merchant.developer_user_id = p_user_id
      and tx.status in ('paid', 'refunded', 'disputed')
      and not exists (select 1 from investor_private.marketplace_payments mp
        where mp.transaction_id = tx.id and mp.livemode)
  ), payments as (
    select l.*, product.name, product.billing_type from ledger l
      join public.connect_products product on product.id = l.offer_id
    union all
    select l.*, product.name, product.billing_type from legacy l
      join public.connect_products product on product.id = l.offer_id
  ), grouped as (
    select currency, count(*) as payment_count,
      count(*) filter (where billing_type = 'one_time') as one_time_purchase_count,
      sum(amount_cents) as gross_cents,
      sum(amount_cents - refund_cents) as revenue_cents,
      sum(amount_cents - refund_cents) filter (where billing_type = 'subscription') as subscription_revenue_cents,
      sum(amount_cents - refund_cents) filter (where billing_type = 'one_time') as one_time_revenue_cents,
      sum(application_fee_cents) as gross_platform_fee_cents,
      sum(refund_cents) as refund_cents
    from payments group by currency
  )
  select jsonb_build_object(
    'partial', coalesce((select bool_or(legacy) from payments), false),
    'currencies', coalesce((select jsonb_agg(jsonb_build_object(
      'currency', currency, 'payment_count', payment_count,
      'one_time_purchase_count', one_time_purchase_count,
      'gross_cents', gross_cents, 'revenue_cents', revenue_cents,
      'subscription_revenue_cents', coalesce(subscription_revenue_cents, 0),
      'one_time_revenue_cents', coalesce(one_time_revenue_cents, 0),
      'gross_platform_fee_cents', gross_platform_fee_cents,
      'refund_cents', refund_cents
    ) order by currency) from grouped), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(r) order by r.paid_at desc) from (
      select payment_id, name as product_name, billing_type, paid_at, amount_cents,
        application_fee_cents, refund_cents, currency, legacy
      from payments order by paid_at desc limit 20
    ) r), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_owned_buy_sales(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_owned_buy_sales(uuid,uuid) to service_role;
