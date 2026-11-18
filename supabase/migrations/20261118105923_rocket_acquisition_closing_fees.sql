-- Rocket acquisition closing fees. No payment or escrow provider is connected.
-- The quote RPC is the sole calculator used by the UI and the acceptance lock.
create function deals_private.rocket_closing_fee(p_price_minor bigint, p_currency text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_total bigint; v_buyer bigint; v_seller bigint; v_precision integer; v_minimum_applied boolean;
begin
  v_precision := case p_currency
    when 'USD' then 2 when 'EUR' then 2 when 'GBP' then 2
    when 'AUD' then 2 when 'CAD' then 2 when 'JPY' then 0 when 'KWD' then 3
    else null end;
  if v_precision is null or p_price_minor is null or p_price_minor not between 100 and 100000000000 then
    raise exception 'Unsupported currency or acquisition price' using errcode = '22023';
  end if;
  if p_currency = 'USD' and p_price_minor < 4950 then
    raise exception 'USD offers must be at least $49.50 so seller proceeds are not negative' using errcode = '22023';
  end if;
  -- Positive integer arithmetic rounds the combined 3% once, half up.
  v_total := (p_price_minor * 3 + 50) / 100;
  v_minimum_applied := p_currency = 'USD' and v_total < 9900;
  if p_currency = 'USD' then v_total := greatest(v_total, 9900); end if;
  v_buyer := (v_total + 1) / 2;
  v_seller := v_total - v_buyer;
  return jsonb_build_object(
    'acquisition_price_minor', p_price_minor, 'currency', p_currency, 'minor_digits', v_precision,
    'buyer_fee_minor', v_buyer, 'seller_fee_minor', v_seller,
    'total_rocket_fee_minor', v_total, 'buyer_total_minor', p_price_minor + v_buyer,
    'seller_net_minor', p_price_minor - v_seller, 'fee_version', 1,
    'usd_minimum_applied', v_minimum_applied
  );
end $$;
revoke all on function deals_private.rocket_closing_fee(bigint,text) from public, anon, authenticated;

create function public.rocket_deal_fee_quote(p_price_minor bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  return deals_private.rocket_closing_fee(p_price_minor, p_currency);
end $$;
revoke all on function public.rocket_deal_fee_quote(bigint,text) from public, anon;
grant execute on function public.rocket_deal_fee_quote(bigint,text) to authenticated;

alter table public.rocket_deal_offers drop constraint if exists rocket_deal_offers_currency_check;
alter table public.rocket_deal_offers add constraint rocket_deal_offers_currency_check
  check (currency in ('USD','EUR','GBP','AUD','CAD','JPY','KWD'));

create function deals_private.validate_offer_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform deals_private.rocket_closing_fee(new.amount_cents,new.currency);
  return new;
end $$;
revoke all on function deals_private.validate_offer_fee() from public, anon, authenticated;
create trigger rocket_deal_offer_fee_valid before insert on public.rocket_deal_offers
  for each row execute function deals_private.validate_offer_fee();

create or replace function public.rocket_deal_make_offer(
  p_app_id uuid,p_amount_cents bigint,p_currency text,p_message text,
  p_conditions text,p_timeframe text,p_request_id uuid,p_no_funds_confirmed boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_conv uuid; v_deal public.rocket_deals; v_offer uuid;
begin
  if v_user is null or p_request_id is null or p_no_funds_confirmed is distinct from true
    or p_currency not in ('USD','EUR','GBP','AUD','CAD','JPY','KWD')
    or length(coalesce(p_message,'')) > 2000 or length(coalesce(p_conditions,'')) > 2000
    or length(coalesce(p_timeframe,'')) > 200
    or deals_private.has_secret(coalesce(p_message,'') || coalesce(p_conditions,'') || coalesce(p_timeframe,'')) then
    raise exception 'Invalid offer or funds acknowledgement missing' using errcode = '22023';
  end if;
  perform deals_private.rocket_closing_fee(p_amount_cents,p_currency);
  if exists(select 1 from public.app_owners o where o.app_id = p_app_id and o.user_id = v_user and o.revoked_at is null) then
    raise exception 'Owners cannot make offers on their own apps' using errcode = '42501'; end if;
  select o.deal_id into v_conv from public.rocket_deal_offers o
    where o.actor_id = v_user and o.request_id = p_request_id;
  if v_conv is not null then return v_conv; end if;
  v_conv := public.start_rocket_acquisition_conversation(p_app_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_conv::text,6));
  select * into v_deal from public.rocket_deals where conversation_id = v_conv for update;
  if v_deal.id is null then
    insert into public.rocket_deals(conversation_id,app_id,buyer_id,seller_id)
      select c.id,c.app_id,c.buyer_id,c.seller_id from public.rocket_conversations c where c.id = v_conv
      returning * into v_deal;
  elsif v_deal.status not in ('offer_pending','negotiating') or
    exists(select 1 from public.rocket_deal_offers where deal_id = v_deal.id) then
    raise exception 'A deal already exists for this buyer and app' using errcode = '23505';
  end if;
  if (select count(*) from public.rocket_deal_offers o where o.actor_id = v_user
    and o.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Daily offer limit reached' using errcode = '42901';
  end if;
  insert into public.rocket_deal_offers(deal_id,actor_id,request_id,amount_cents,currency,message,conditions,handover_timeframe)
    values(v_deal.id,v_user,p_request_id,p_amount_cents,p_currency,coalesce(p_message,''),coalesce(p_conditions,''),coalesce(p_timeframe,''))
    returning id into v_offer;
  insert into public.rocket_deal_events(deal_id,actor_id,event,detail)
    values(v_deal.id,v_user,'offer_submitted',jsonb_build_object('offer_id',v_offer));
  perform deals_private.notice(v_deal,v_user,'A new offer was submitted');
  return v_deal.id;
end $$;

create table public.rocket_deal_financials (
  deal_id uuid primary key references public.rocket_deals(id),
  accepted_offer_id uuid not null unique references public.rocket_deal_offers(id),
  acquisition_price_minor bigint not null check (acquisition_price_minor between 100 and 100000000000),
  currency text not null check (currency in ('USD','EUR','GBP','AUD','CAD','JPY','KWD')),
  minor_digits integer not null check (minor_digits in (0,2,3)),
  buyer_fee_minor bigint not null check (buyer_fee_minor >= 0),
  seller_fee_minor bigint not null check (seller_fee_minor >= 0),
  total_rocket_fee_minor bigint not null check (total_rocket_fee_minor = buyer_fee_minor + seller_fee_minor),
  buyer_total_minor bigint not null check (buyer_total_minor = acquisition_price_minor + buyer_fee_minor),
  seller_net_minor bigint not null check (seller_net_minor = acquisition_price_minor - seller_fee_minor),
  fee_version integer not null check (fee_version = 1),
  fee_status text not null default 'agreed' check (fee_status in ('agreed','pending_collection','collected','waived','refunded')),
  transaction_status text not null default 'offer_accepted' check (transaction_status in
    ('offer_accepted','awaiting_escrow','escrow_initiated','funds_secured','transfer_in_progress','buyer_inspection','completed','cancelled','disputed','refunded')),
  escrow_provider text check (length(escrow_provider) <= 80),
  external_escrow_id text check (length(external_escrow_id) <= 200),
  provider_fee_minor bigint check (provider_fee_minor >= 0),
  processing_fee_minor bigint check (processing_fee_minor >= 0),
  fee_collected_minor bigint not null default 0 check (fee_collected_minor >= 0),
  fee_refunded_minor bigint not null default 0 check (fee_refunded_minor >= 0),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (fee_collected_minor <= total_rocket_fee_minor and fee_refunded_minor <= fee_collected_minor),
  check (transaction_status <> 'completed' or closed_at is not null)
);
create unique index rocket_deal_external_escrow_unique on public.rocket_deal_financials(escrow_provider,external_escrow_id)
  where external_escrow_id is not null;
alter table public.rocket_deal_financials enable row level security;
revoke all on public.rocket_deal_financials from public, anon, authenticated;
grant select on public.rocket_deal_financials to authenticated;
grant all on public.rocket_deal_financials to service_role;
create policy rocket_deal_financial_parties on public.rocket_deal_financials for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id = deal_id
    and (select auth.uid()) in (d.buyer_id,d.seller_id)));

create table public.rocket_deal_financial_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.rocket_deals(id),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  action text not null,
  evidence text not null check (length(evidence) between 20 and 2000),
  previous_status text not null,
  next_status text not null,
  created_at timestamptz not null default now(),
  unique (actor_id,request_id)
);
create index rocket_deal_financial_events_deal_idx on public.rocket_deal_financial_events(deal_id,created_at);
alter table public.rocket_deal_financial_events enable row level security;
revoke all on public.rocket_deal_financial_events from public, anon, authenticated;
grant all on public.rocket_deal_financial_events to service_role;

-- An existing, atomically accepted offer is immutable. Lock its price and fee
-- in the same transaction that records the accepted event.
create function deals_private.lock_accepted_offer_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.rocket_deal_offers; v_quote jsonb;
begin
  if new.event <> 'accepted' then return new; end if;
  select * into v_offer from public.rocket_deal_offers where id = (new.detail->>'offer_id')::uuid
    and deal_id = new.deal_id;
  if v_offer.id is null then raise exception 'Accepted offer missing' using errcode = '22023'; end if;
  v_quote := deals_private.rocket_closing_fee(v_offer.amount_cents,v_offer.currency);
  insert into public.rocket_deal_financials (
    deal_id,accepted_offer_id,acquisition_price_minor,currency,minor_digits,buyer_fee_minor,seller_fee_minor,
    total_rocket_fee_minor,buyer_total_minor,seller_net_minor,fee_version
  ) values (
    new.deal_id,v_offer.id,v_offer.amount_cents,v_offer.currency,(v_quote->>'minor_digits')::integer,
    (v_quote->>'buyer_fee_minor')::bigint,(v_quote->>'seller_fee_minor')::bigint,
    (v_quote->>'total_rocket_fee_minor')::bigint,(v_quote->>'buyer_total_minor')::bigint,
    (v_quote->>'seller_net_minor')::bigint,1
  );
  return new;
end $$;
revoke all on function deals_private.lock_accepted_offer_fee() from public, anon, authenticated;
create trigger rocket_deal_lock_fee after insert on public.rocket_deal_events
  for each row execute function deals_private.lock_accepted_offer_fee();

create function deals_private.track_escrow_preparation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'awaiting_escrow' and old.status is distinct from new.status then
    update public.rocket_deal_financials set transaction_status = 'awaiting_escrow', updated_at = now()
      where deal_id = new.id and transaction_status = 'offer_accepted';
  end if;
  return new;
end $$;
revoke all on function deals_private.track_escrow_preparation() from public, anon, authenticated;
create trigger rocket_deal_escrow_preparation after update of status on public.rocket_deals
  for each row execute function deals_private.track_escrow_preparation();

-- Only a confirmed Rocket admin may record evidence from an external provider.
-- No operation contacts, funds, or purports to verify an escrow provider.
create function public.rocket_admin_record_deal_finance(
  p_deal_id uuid,p_action text,p_request_id uuid,p_evidence text,
  p_provider text default null,p_external_id text default null,
  p_provider_fee_minor bigint default null,p_processing_fee_minor bigint default null
) returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_row public.rocket_deal_financials;
  v_next text; v_fee_status text; v_prior text;
begin
  if v_actor is null or not coalesce(public.is_rocket_admin(),false) then
    raise exception 'Admin access denied' using errcode = '42501'; end if;
  if p_request_id is null or length(btrim(coalesce(p_evidence,''))) not between 20 and 2000
    or deals_private.has_secret(p_evidence) or p_action is null then
    raise exception 'A non-secret evidence note of at least 20 characters is required' using errcode = '22023'; end if;
  if (p_provider_fee_minor is not null or p_processing_fee_minor is not null)
    and p_action not in ('escrow_initiated','completed') then
    raise exception 'External fee amounts can be recorded only during setup or completion' using errcode = '22023'; end if;
  if p_provider_fee_minor not between 0 and 100000000000 or p_processing_fee_minor not between 0 and 100000000000 then
    raise exception 'External fee amount invalid' using errcode = '22023'; end if;
  if p_action <> 'escrow_initiated' and (p_provider is not null or p_external_id is not null) then
    raise exception 'External reference can only be linked at escrow initiation' using errcode = '22023'; end if;
  select * into v_row from public.rocket_deal_financials where deal_id = p_deal_id for update;
  if v_row.deal_id is null then raise exception 'Accepted deal not found' using errcode = 'P0002'; end if;
  if exists(select 1 from public.rocket_deal_financial_events where actor_id = v_actor and request_id = p_request_id
    and deal_id = p_deal_id and action = p_action) then return v_row.transaction_status; end if;
  if exists(select 1 from public.rocket_deal_financial_events where actor_id = v_actor and request_id = p_request_id) then
    raise exception 'Request ID already used' using errcode = '23505'; end if;
  v_prior := v_row.transaction_status; v_next := v_prior; v_fee_status := v_row.fee_status;
  if p_action = 'escrow_initiated' and v_prior = 'awaiting_escrow' then
    if length(btrim(coalesce(p_provider,''))) not between 2 and 80
      or length(btrim(coalesce(p_external_id,''))) not between 3 and 200 then
      raise exception 'External provider and reference required' using errcode = '22023'; end if;
    v_next := 'escrow_initiated';
  elsif p_action = 'funds_secured' and v_prior = 'escrow_initiated' and v_row.external_escrow_id is not null then
    v_next := 'funds_secured';
  elsif p_action = 'transfer_in_progress' and v_prior = 'funds_secured' then
    v_next := 'transfer_in_progress';
  elsif p_action = 'buyer_inspection' and v_prior = 'transfer_in_progress' then
    v_next := 'buyer_inspection';
  elsif p_action = 'completed' and v_prior = 'buyer_inspection' then
    v_next := 'completed'; v_fee_status := 'pending_collection';
  elsif p_action = 'cancelled' and v_prior in ('offer_accepted','awaiting_escrow','escrow_initiated') then
    v_next := 'cancelled'; v_fee_status := 'waived';
  elsif p_action = 'disputed' and v_prior in ('funds_secured','transfer_in_progress','buyer_inspection','completed') then
    v_next := 'disputed';
  elsif p_action = 'refunded' and v_prior in ('disputed','cancelled','completed') then
    v_next := 'refunded';
    if v_row.fee_collected_minor = 0 then v_fee_status := 'waived'; end if;
  elsif p_action = 'fee_collected' and v_prior = 'completed' and v_fee_status = 'pending_collection' then
    v_fee_status := 'collected';
  elsif p_action = 'fee_waived' and v_prior = 'completed' and v_fee_status = 'pending_collection' then
    v_fee_status := 'waived';
  elsif p_action = 'fee_refunded' and v_prior = 'refunded' and v_row.fee_collected_minor > 0
    and v_row.fee_refunded_minor = 0 then
    v_fee_status := 'refunded';
  else
    raise exception 'Invalid financial transition' using errcode = '22023';
  end if;
  update public.rocket_deal_financials set
    transaction_status = v_next, fee_status = v_fee_status,
    escrow_provider = case when p_action = 'escrow_initiated' then btrim(p_provider) else escrow_provider end,
    external_escrow_id = case when p_action = 'escrow_initiated' then btrim(p_external_id) else external_escrow_id end,
    provider_fee_minor = coalesce(p_provider_fee_minor,provider_fee_minor),
    processing_fee_minor = coalesce(p_processing_fee_minor,processing_fee_minor),
    fee_collected_minor = case when p_action = 'fee_collected' then total_rocket_fee_minor else fee_collected_minor end,
    fee_refunded_minor = case when p_action = 'fee_refunded' then fee_collected_minor else fee_refunded_minor end,
    closed_at = case when p_action = 'completed' then now() else closed_at end,
    updated_at = now()
    where deal_id = p_deal_id;
  insert into public.rocket_deal_financial_events(deal_id,actor_id,request_id,action,evidence,previous_status,next_status)
    values(p_deal_id,v_actor,p_request_id,p_action,btrim(p_evidence),v_prior,v_next);
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(v_actor,'deal_finance_' || p_action,'rocket_deal',p_deal_id,
      jsonb_build_object('financial_event',p_request_id,'transaction_status',v_next,'fee_status',v_fee_status));
  return v_next;
end $$;
revoke all on function public.rocket_admin_record_deal_finance(uuid,text,uuid,text,text,text,bigint,bigint) from public, anon;
grant execute on function public.rocket_admin_record_deal_finance(uuid,text,uuid,text,text,text,bigint,bigint) to authenticated;

create function public.rocket_admin_deal_financial_report() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not coalesce(public.is_rocket_admin(),false) then
    raise exception 'Admin access denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'currencies', coalesce((select jsonb_agg(row_to_json(s)) from (
      select currency,
        count(*) filter (where transaction_status = 'completed') as completed_acquisitions,
        count(*) filter (where transaction_status = 'cancelled') as cancelled_transactions,
        coalesce(sum(acquisition_price_minor) filter (where transaction_status = 'completed'),0) as completed_volume_minor,
        coalesce(sum(total_rocket_fee_minor) filter (where transaction_status = 'completed' and fee_status <> 'waived'),0) as gross_earned_minor,
        coalesce(sum(fee_collected_minor),0) as fees_collected_minor,
        coalesce(sum(fee_refunded_minor),0) as fees_refunded_minor,
        coalesce(sum(total_rocket_fee_minor) filter (where transaction_status = 'completed' and fee_status = 'pending_collection'),0) as fees_outstanding_minor,
        coalesce(round(avg(acquisition_price_minor) filter (where transaction_status = 'completed')),0) as average_transaction_minor
      from public.rocket_deal_financials group by currency order by currency
    ) s),'[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(row_to_json(t)) from (
      select f.deal_id,f.currency,f.acquisition_price_minor,f.buyer_fee_minor,f.seller_fee_minor,
        f.total_rocket_fee_minor,f.fee_status,f.transaction_status,f.fee_collected_minor,
        f.fee_refunded_minor,f.provider_fee_minor,f.processing_fee_minor,f.escrow_provider,
        f.external_escrow_id,f.closed_at,f.updated_at
      from public.rocket_deal_financials f order by f.updated_at desc limit 100
    ) t),'[]'::jsonb)
  );
end $$;
revoke all on function public.rocket_admin_deal_financial_report() from public, anon;
grant execute on function public.rocket_admin_deal_financial_report() to authenticated;
