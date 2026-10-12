-- Quality must be UNVERIFIED whenever a paid source lacks a reconciled receipt.
create or replace function investor_private.calculate_metrics(p_as_of timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz := p_as_of - interval '30 days';
  v_previous timestamptz := p_as_of - interval '60 days';
  v_connected jsonb; v_cross jsonb; v_gmv jsonb; v_revenue jsonb;
begin
  with qualifying as (
    select e.app_id,e.user_id,e.issued_at from investor_private.oauth_success e
    join public.rocket_oauth_access_tokens t on t.id=e.token_id and t.revoked_at is null
    join public.rocket_oauth_clients c on c.client_id=e.client_id and c.app_id=e.app_id
      and c.environment='production' and c.is_active
    join investor_private.app_classification k on k.app_id=e.app_id
      and k.classification='INDEPENDENT' and k.effective_at<=e.issued_at
    where e.environment='production' and e.user_id is not null and e.issued_at<p_as_of
  ), app_first as (select app_id,min(issued_at) first_at from qualifying group by app_id)
  select jsonb_build_object('total',(select count(*) from app_first),
    'active_30d',(select count(distinct app_id) from qualifying where issued_at>=v_start),
    'new_30d',(select count(*) from app_first where first_at>=v_start),
    'previous_active_30d',(select count(distinct app_id) from qualifying where issued_at>=v_previous and issued_at<v_start),
    'quality','PARTIAL','limitations','Pre-deployment OAuth history lacks atomic canonical success events')
    into v_connected;

  with qualifying as (
    select e.app_id,e.user_id,e.issued_at from investor_private.oauth_success e
    join public.rocket_oauth_access_tokens t on t.id=e.token_id and t.revoked_at is null
    join public.rocket_oauth_clients c on c.client_id=e.client_id and c.app_id=e.app_id
      and c.environment='production' and c.is_active
    join investor_private.app_classification k on k.app_id=e.app_id
      and k.classification='INDEPENDENT' and k.effective_at<=e.issued_at
    where e.environment='production' and e.user_id is not null and e.issued_at<p_as_of
  ), per_app as (select user_id,app_id,min(issued_at) first_at from qualifying group by user_id,app_id),
    second_app as (select user_id,max(first_at) second_at from
      (select user_id,first_at,row_number() over(partition by user_id order by first_at,app_id) ordinal from per_app) x
      where ordinal<=2 group by user_id having count(*)=2)
  select jsonb_build_object('total',(select count(*) from second_app),
    'active_30d',(select count(*) from (select user_id from qualifying where issued_at>=v_start group by user_id having count(distinct app_id)>=2) x),
    'new_30d',(select count(*) from second_app where second_at>=v_start),
    'previous_active_30d',(select count(*) from (select user_id from qualifying where issued_at>=v_previous and issued_at<v_start group by user_id having count(distinct app_id)>=2) x),
    'quality','PARTIAL','limitations','Pre-deployment canonical OAuth success history is incomplete')
    into v_cross;

  select jsonb_build_object('currencies',coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb),
    'quality','PARTIAL',
    'limitations','Ledger is webhook-fed; independent Stripe reconciliation, refunds and subscription renewals still need acceptance') into v_gmv
  from (select p.currency,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start),0) gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_previous and p.paid_at<v_start),0) previous_gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_previous and p.paid_at<v_start),0)
        - coalesce((select sum(case when a.kind='REVERSAL' then -a.amount_cents else a.amount_cents end) from investor_private.marketplace_adjustments a
          join investor_private.marketplace_payments pm on pm.id=a.payment_id
          where pm.currency=p.currency and pm.livemode and a.occurred_at>=v_previous and a.occurred_at<v_start),0) previous_net_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start),0)
        - coalesce((select sum(case when a.kind='REVERSAL' then -a.amount_cents else a.amount_cents end) from investor_private.marketplace_adjustments a
          join investor_private.marketplace_payments pm on pm.id=a.payment_id
          where pm.currency=p.currency and pm.livemode and a.occurred_at>=v_start and a.occurred_at<p_as_of),0) net_cents,
      count(*) filter(where p.paid_at>=v_start) completed_payments,
      count(distinct p.app_id) filter(where p.paid_at>=v_start) revenue_apps,
      count(*) filter(where p.paid_at>=v_start and p.origin='ROCKET_MARKETPLACE') rocket_origin_payments,
      count(*) filter(where p.paid_at>=v_start and p.origin='EXTERNAL_BUTTON') external_origin_payments,
      count(*) filter(where p.paid_at>=v_start and p.origin='UNKNOWN') unknown_origin_payments,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start and
        coalesce(pc.related_party,p.related_party)='INDEPENDENT_CUSTOMER'),0) independent_customer_gross_cents,
      coalesce(sum(p.amount_cents) filter(where p.paid_at>=v_start and
        coalesce(pc.related_party,p.related_party)='RELATED_PARTY'),0) related_party_gross_cents
    from investor_private.marketplace_payments p
    join investor_private.app_classification k on k.app_id=p.app_id and k.classification='INDEPENDENT'
      and k.effective_at<=p.paid_at
    left join investor_private.payment_classification pc on pc.payment_id=p.id
    where p.livemode and p.paid_at<p_as_of group by p.currency) x;

  select jsonb_build_object(
    'amount_cents',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      and not exists(select 1 from public.rocket_sponsorships s where s.stripe_livemode and s.stripe_payment_status='paid'
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source_record_id=s.id::text
          and r.source in ('FEATURED_APP','CATEGORY_SPONSOR')))
      and not exists(select 1 from investor_private.marketplace_payments p where p.livemode and p.application_fee_cents>0
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source='MARKETPLACE_FEE'
          and r.source_record_id=p.id::text))
      and not exists(select 1 from investor_private.rocket_revenue_receipts r
        join public.rocket_sponsorships s on s.id::text=r.source_record_id
        where r.source in ('FEATURED_APP','CATEGORY_SPONSOR') and s.stripe_payment_status<>'paid')
      then coalesce((select sum(r.amount_cents-r.processing_cost_cents) from investor_private.rocket_revenue_receipts r
        where r.currency='usd' and r.paid_at>=v_start and r.paid_at<p_as_of),0) else null end,
    'previous_30d_cents',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      and not exists(select 1 from investor_private.rocket_revenue_receipts r
        join public.rocket_sponsorships s on s.id::text=r.source_record_id
        where r.source in ('FEATURED_APP','CATEGORY_SPONSOR') and s.stripe_payment_status<>'paid')
      then coalesce((select sum(r.amount_cents-r.processing_cost_cents) from investor_private.rocket_revenue_receipts r
        where r.currency='usd' and r.paid_at>=v_previous and r.paid_at<v_start),0) else null end,
    'currency','usd','quality',case when (select status from investor_private.revenue_sync_runs order by completed_at desc limit 1)='COMPLETE'
      and (select completed_at from investor_private.revenue_sync_runs order by completed_at desc limit 1)>p_as_of-interval '36 hours'
      and not exists(select 1 from investor_private.rocket_revenue_receipts r
        join public.rocket_sponsorships s on s.id::text=r.source_record_id
        where r.source in ('FEATURED_APP','CATEGORY_SPONSOR') and s.stripe_payment_status<>'paid')
      and not exists(select 1 from public.rocket_sponsorships s where s.stripe_livemode and s.stripe_payment_status='paid'
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source_record_id=s.id::text
          and r.source in ('FEATURED_APP','CATEGORY_SPONSOR')))
      and not exists(select 1 from investor_private.marketplace_payments p where p.livemode and p.application_fee_cents>0
        and not exists(select 1 from investor_private.rocket_revenue_receipts r where r.source='MARKETPLACE_FEE'
          and r.source_record_id=p.id::text))
      then 'PARTIAL' else 'UNVERIFIED' end,
    'source_breakdown',jsonb_build_object(
      'developer',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source='DEVELOPER' and paid_at>=v_start and paid_at<p_as_of),0),
      'marketplace_fees',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source='MARKETPLACE_FEE' and paid_at>=v_start and paid_at<p_as_of),0),
      'advertising',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
        where source in ('FEATURED_APP','CATEGORY_SPONSOR') and paid_at>=v_start and paid_at<p_as_of),0)),
    'related_party_cents',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
      where related_party='RELATED_PARTY' and paid_at>=v_start and paid_at<p_as_of),0),
    'independent_customer_cents',coalesce((select sum(amount_cents-processing_cost_cents) from investor_private.rocket_revenue_receipts
      where related_party='INDEPENDENT_CUSTOMER' and paid_at>=v_start and paid_at<p_as_of),0),
    'current_30d_gross_advertising_cents',coalesce((select sum(s.paid_amount_cents) from public.rocket_sponsorships s
      where s.stripe_livemode and s.stripe_payment_status='paid' and s.paid_at>=v_start and s.paid_at<p_as_of),0),
    'related_party_gross_advertising_cents',coalesce((select sum(s.paid_amount_cents) from public.rocket_sponsorships s
      join investor_private.sponsorship_classification k on k.sponsorship_id=s.id and k.related_party='RELATED_PARTY'
      where s.stripe_livemode and s.stripe_payment_status='paid' and s.paid_at>=v_start and s.paid_at<p_as_of),0),
    'limitations','Payment-date management metric; Create and separate Launch/Post/Media billing excluded. Refund/dispute changes fail closed until reconciled') into v_revenue;
  return jsonb_build_object('as_of',p_as_of,'window_start',v_start,'previous_window_start',v_previous,
    'connected_apps',v_connected,'cross_app_users',v_cross,'marketplace_gmv',v_gmv,'net_retained_revenue',v_revenue);
end; $$;
