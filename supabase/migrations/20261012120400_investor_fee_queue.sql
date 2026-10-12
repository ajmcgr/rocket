-- Bound each reconciliation run by receipts still awaiting verification.
-- Previously reconciled fees must not crowd out later marketplace payments.
create or replace function public.rocket_pending_marketplace_fees() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select p.id,p.stripe_account_id,p.stripe_invoice_id,p.stripe_payment_intent_id,
      p.application_fee_cents,p.currency
    from investor_private.marketplace_payments p
    where p.livemode and p.application_fee_cents>0
      and not exists (
        select 1 from investor_private.rocket_revenue_receipts r
        where r.source='MARKETPLACE_FEE' and r.source_record_id=p.id::text
          and r.reconciliation_status='STRIPE_RECONCILED'
      )
    order by p.paid_at limit 101
  ) x;
  return v_result;
end; $$;
