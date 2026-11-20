-- Escrow.com integration ledger. Creation is gated in the Edge Function to sandbox only.
-- The existing accepted-offer financial record remains the source of fee amounts.
create table public.rocket_deal_escrow (
  deal_id uuid primary key references public.rocket_deals(id),
  environment text not null check (environment in ('sandbox','production')),
  reference text not null unique check (length(reference) between 8 and 24),
  transaction_id bigint unique check (transaction_id > 0),
  attempt_status text not null default 'creating' check (attempt_status in ('creating','created','reconciliation_required')),
  provider_status text not null default 'not_created',
  buyer_agreed boolean not null default false,
  seller_agreed boolean not null default false,
  funds_secured boolean not null default false,
  handover_started boolean not null default false,
  inspection_started boolean not null default false,
  completed boolean not null default false,
  cancelled boolean not null default false,
  refunded boolean not null default false,
  rocket_fee_disbursed_minor bigint not null default 0 check (rocket_fee_disbursed_minor >= 0),
  escrow_fee_minor bigint check (escrow_fee_minor >= 0),
  last_synced_at timestamptz,
  sync_attempts integer not null default 0 check (sync_attempts >= 0),
  last_error text check (length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rocket_deal_escrow enable row level security;
revoke all on public.rocket_deal_escrow from public,anon,authenticated;
grant select on public.rocket_deal_escrow to authenticated;
grant all on public.rocket_deal_escrow to service_role;
create policy rocket_deal_escrow_parties on public.rocket_deal_escrow for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id
    and (select auth.uid()) in (d.buyer_id,d.seller_id)));

create table public.rocket_deal_escrow_identity (
  deal_id uuid primary key references public.rocket_deal_escrow(deal_id),
  buyer_email text not null,
  seller_email text not null,
  app_name text not null,
  inspection_days integer not null check (inspection_days between 1 and 30)
);
alter table public.rocket_deal_escrow_identity enable row level security;
revoke all on public.rocket_deal_escrow_identity from public,anon,authenticated;
grant all on public.rocket_deal_escrow_identity to service_role;

-- An immutable, single attempt claim prevents concurrent creation and retries
-- after an ambiguous provider response. Only service_role may invoke this RPC.
create function public.rocket_escrow_claim(p_deal_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_deal public.rocket_deals; v_fin public.rocket_deal_financials;
  v_agreement public.rocket_deal_agreements; v_checklist public.rocket_deal_checklists;
  v_existing public.rocket_deal_escrow; v_buyer_email text; v_seller_email text; v_name text;
  v_inspection text; v_days integer; v_quote jsonb;
begin
  select * into v_deal from public.rocket_deals where id=p_deal_id for update;
  if v_deal.id is null or p_actor not in (v_deal.buyer_id,v_deal.seller_id)
    or v_deal.status<>'awaiting_escrow' then
    raise exception 'Deal is not ready for escrow' using errcode='42501'; end if;
  select * into v_existing from public.rocket_deal_escrow where deal_id=p_deal_id;
  if v_existing.deal_id is not null then
    return jsonb_build_object('claimed',false,'reference',v_existing.reference,'transaction_id',v_existing.transaction_id);
  end if;
  if not public.rocket_listing_is_public(v_deal.app_id,v_deal.seller_id) then
    raise exception 'Seller ownership is not verified' using errcode='42501'; end if;
  select * into v_fin from public.rocket_deal_financials where deal_id=p_deal_id for update;
  if v_fin.deal_id is not null then
    v_quote := deals_private.rocket_closing_fee(v_fin.acquisition_price_minor,v_fin.currency);
  end if;
  if v_fin.deal_id is null or v_fin.transaction_status<>'awaiting_escrow'
    or v_fin.currency<>'USD' or v_fin.fee_version<>1
    or v_fin.escrow_provider is not null or v_fin.external_escrow_id is not null
    or v_fin.total_rocket_fee_minor<>v_fin.buyer_fee_minor+v_fin.seller_fee_minor
    or v_fin.buyer_total_minor<>v_fin.acquisition_price_minor+v_fin.buyer_fee_minor
    or v_fin.seller_net_minor<>v_fin.acquisition_price_minor-v_fin.seller_fee_minor
    or v_fin.buyer_fee_minor<>(v_quote->>'buyer_fee_minor')::bigint
    or v_fin.seller_fee_minor<>(v_quote->>'seller_fee_minor')::bigint
    or (select o.amount_cents<>v_fin.acquisition_price_minor or o.currency<>v_fin.currency
        from public.rocket_deal_offers o where o.id=v_fin.accepted_offer_id) then
    raise exception 'Locked financial terms are not eligible' using errcode='22023'; end if;
  select * into v_agreement from public.rocket_deal_agreements where deal_id=p_deal_id order by version desc limit 1;
  select * into v_checklist from public.rocket_deal_checklists where deal_id=p_deal_id order by version desc limit 1;
  if v_agreement.id is null or v_checklist.id is null
    or (select count(*) from public.rocket_deal_approvals where deal_id=p_deal_id and kind='agreement' and version=v_agreement.version)<>2
    or (select count(*) from public.rocket_deal_approvals where deal_id=p_deal_id and kind='checklist' and version=v_checklist.version)<>2 then
    raise exception 'Current agreement and checklist require both approvals' using errcode='22023'; end if;
  select email into v_buyer_email from auth.users where id=v_deal.buyer_id;
  select email into v_seller_email from auth.users where id=v_deal.seller_id;
  select name into v_name from app_graph.apps where id=v_deal.app_id;
  v_inspection := btrim(v_agreement.terms->>'inspection_period');
  if v_inspection !~* '^([1-9]|[12][0-9]|30) days?$' then
    raise exception 'Inspection period must be 1 to 30 days' using errcode='22023'; end if;
  v_days := split_part(v_inspection,' ',1)::integer;
  if nullif(v_buyer_email,'') is null or nullif(v_seller_email,'') is null
    or lower(v_buyer_email)=lower(v_seller_email) or nullif(v_name,'') is null then
    raise exception 'Both parties need distinct email addresses' using errcode='22023'; end if;
  insert into public.rocket_deal_escrow(deal_id,environment,reference)
    values(p_deal_id,'sandbox','rk' || substr(replace(p_deal_id::text,'-',''),1,22))
    returning * into v_existing;
  insert into public.rocket_deal_escrow_identity(deal_id,buyer_email,seller_email,app_name,inspection_days)
    values(p_deal_id,v_buyer_email,v_seller_email,v_name,v_days);
  return jsonb_build_object('claimed',true,'reference',v_existing.reference,
    'buyer_email',v_buyer_email,'seller_email',v_seller_email,'app_name',v_name,
    'price_minor',v_fin.acquisition_price_minor,'currency',v_fin.currency,
    'buyer_fee_minor',v_fin.buyer_fee_minor,'seller_fee_minor',v_fin.seller_fee_minor,
    'total_fee_minor',v_fin.total_rocket_fee_minor,'terms',v_agreement.terms,'checklist',v_checklist.items);
end $$;
revoke all on function public.rocket_escrow_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rocket_escrow_claim(uuid,uuid) to service_role;

-- Browser admins may not manually record Escrow.com funding, completion, or fees.
create function deals_private.guard_escrow_finance() returns trigger
language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null
    and (new.escrow_provider='escrow.com' or old.escrow_provider='escrow.com'
      or exists(select 1 from public.rocket_deal_escrow where deal_id=new.deal_id)) then
    raise exception 'Escrow.com financial state requires provider verification' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function deals_private.guard_escrow_finance() from public,anon,authenticated;
create trigger rocket_escrow_finance_guard before update on public.rocket_deal_financials
  for each row execute function deals_private.guard_escrow_finance();

create table public.rocket_deal_escrow_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.rocket_deals(id),
  transaction_id bigint not null,
  previous_status text not null,
  next_status text not null,
  created_at timestamptz not null default now()
);
create index rocket_deal_escrow_events_deal_idx on public.rocket_deal_escrow_events(deal_id,created_at desc);
alter table public.rocket_deal_escrow_events enable row level security;
revoke all on public.rocket_deal_escrow_events from public,anon,authenticated;
grant select on public.rocket_deal_escrow_events to authenticated;
grant all on public.rocket_deal_escrow_events to service_role;
create policy rocket_deal_escrow_events_parties on public.rocket_deal_escrow_events for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id
    and (select auth.uid()) in (d.buyer_id,d.seller_id)));

-- Prevent terms or handover assets changing after a provider attempt begins.
create function deals_private.guard_escrow_terms() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.rocket_deal_escrow where deal_id=new.deal_id) then
    raise exception 'Escrow terms are locked after initiation' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function deals_private.guard_escrow_terms() from public,anon,authenticated;
create trigger rocket_escrow_agreement_lock before insert on public.rocket_deal_agreements
  for each row execute function deals_private.guard_escrow_terms();
create trigger rocket_escrow_checklist_lock before insert on public.rocket_deal_checklists
  for each row execute function deals_private.guard_escrow_terms();

create table public.rocket_deal_handover (
  deal_id uuid not null references public.rocket_deals(id),
  item_index integer not null check (item_index between 0 and 59),
  status text not null default 'pending' check (status in ('pending','in_progress','delivered','accepted','needs_attention')),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(deal_id,item_index)
);
alter table public.rocket_deal_handover enable row level security;
revoke all on public.rocket_deal_handover from public,anon,authenticated;
grant select on public.rocket_deal_handover to authenticated;
grant all on public.rocket_deal_handover to service_role;
create policy rocket_deal_handover_parties on public.rocket_deal_handover for select to authenticated
  using (exists(select 1 from public.rocket_deals d where d.id=deal_id
    and (select auth.uid()) in (d.buyer_id,d.seller_id)));

create function public.rocket_deal_update_handover(p_deal_id uuid,p_item_index integer,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid := (select auth.uid()); v_deal public.rocket_deals;
  v_escrow public.rocket_deal_escrow; v_items jsonb; v_previous text; v_recipient uuid;
begin
  select * into v_deal from public.rocket_deals where id=p_deal_id;
  select * into v_escrow from public.rocket_deal_escrow where deal_id=p_deal_id for update;
  if v_actor is null or v_deal.id is null or v_actor not in (v_deal.buyer_id,v_deal.seller_id)
    or v_escrow.deal_id is null or not v_escrow.funds_secured
    or v_escrow.provider_status in ('completed','cancelled','refunded','disputed') then
    raise exception 'Handover requires provider-verified funding' using errcode='42501'; end if;
  select items into v_items from public.rocket_deal_checklists
    where deal_id=p_deal_id order by version desc limit 1;
  if p_item_index is null or p_item_index<0 or p_item_index>=jsonb_array_length(v_items) then
    raise exception 'Invalid handover item' using errcode='22023'; end if;
  select status into v_previous from public.rocket_deal_handover
    where deal_id=p_deal_id and item_index=p_item_index;
  v_previous := coalesce(v_previous,'pending');
  if (v_actor=v_deal.seller_id and not (
      (v_previous in ('pending','needs_attention') and p_status='in_progress')
      or (v_previous='in_progress' and p_status='delivered')))
    or (v_actor=v_deal.buyer_id and not (v_previous='delivered'
      and p_status in ('accepted','needs_attention'))) then
    raise exception 'Invalid handover transition' using errcode='22023'; end if;
  insert into public.rocket_deal_handover(deal_id,item_index,status,updated_by)
    values(p_deal_id,p_item_index,p_status,v_actor)
    on conflict(deal_id,item_index) do update set status=excluded.status,
      updated_by=excluded.updated_by,updated_at=now();
  v_recipient := case when v_actor=v_deal.seller_id then v_deal.buyer_id else v_deal.seller_id end;
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values(v_recipient,'monetize','Deal handover updated',
      'An asset in your Rocket acquisition checklist is now ' || replace(p_status,'_',' ') || '.',
      '/deals/' || p_deal_id::text,
      'rocket-handover:' || p_deal_id::text || ':' || p_item_index::text || ':' || p_status)
    on conflict(user_id,event_key) do nothing;
end $$;
revoke all on function public.rocket_deal_update_handover(uuid,integer,text) from public,anon;
grant execute on function public.rocket_deal_update_handover(uuid,integer,text) to authenticated;

-- Only the server can apply a snapshot it fetched from Escrow.com. The RPC is
-- atomic, status changes are recorded, and notifications use durable event keys.
create function public.rocket_escrow_apply_snapshot(p_deal_id uuid,p_transaction_id bigint,p_snapshot jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare v_escrow public.rocket_deal_escrow; v_fin public.rocket_deal_financials;
  v_deal public.rocket_deals; v_prior text; v_next text; v_fee bigint;
  v_title text; v_body text; v_recipient uuid;
begin
  select * into v_escrow from public.rocket_deal_escrow where deal_id=p_deal_id for update;
  if v_escrow.deal_id is null or p_transaction_id is null or p_transaction_id<=0
    or (v_escrow.transaction_id is not null and v_escrow.transaction_id<>p_transaction_id)
    or p_snapshot->>'reference' is distinct from v_escrow.reference
    or p_snapshot->>'environment' is distinct from v_escrow.environment
    or coalesce(p_snapshot->>'status','') not in ('awaiting_acceptance','awaiting_payment','funds_secured','handover','inspection','completed','cancelled','refunded','disputed')
    or (p_snapshot->>'rocket_fee_disbursed_minor')::bigint<0 then
    raise exception 'Provider snapshot does not match the deal' using errcode='22023'; end if;
  select * into v_fin from public.rocket_deal_financials where deal_id=p_deal_id for update;
  select * into v_deal from public.rocket_deals where id=p_deal_id;
  v_fee := (p_snapshot->>'rocket_fee_disbursed_minor')::bigint;
  if v_fin.deal_id is null or v_fee>v_fin.total_rocket_fee_minor
    or (v_escrow.transaction_id is not null and v_fin.external_escrow_id<>p_transaction_id::text)
    or (v_fin.escrow_provider is not null and v_fin.escrow_provider<>'escrow.com') then
    raise exception 'Financial snapshot mismatch' using errcode='22023'; end if;
  v_prior := v_escrow.provider_status; v_next := p_snapshot->>'status';
  if v_prior in ('completed','cancelled','refunded') and v_next not in (v_prior,'refunded') then
    raise exception 'Terminal provider status cannot regress' using errcode='22023'; end if;
  if v_prior in ('awaiting_acceptance','awaiting_payment','funds_secured','handover','inspection')
    and v_next in ('awaiting_acceptance','awaiting_payment','funds_secured','handover','inspection')
    and array_position(array['awaiting_acceptance','awaiting_payment','funds_secured','handover','inspection'],v_next)
      < array_position(array['awaiting_acceptance','awaiting_payment','funds_secured','handover','inspection'],v_prior) then
    raise exception 'Provider status cannot regress' using errcode='22023'; end if;
  if v_escrow.funds_secured and v_next in ('awaiting_acceptance','awaiting_payment') then
    raise exception 'Provider status cannot regress before refund' using errcode='22023'; end if;
  update public.rocket_deal_escrow set
    transaction_id=p_transaction_id,attempt_status='created',provider_status=v_next,
    buyer_agreed=(p_snapshot->>'buyer_agreed')::boolean,
    seller_agreed=(p_snapshot->>'seller_agreed')::boolean,
    funds_secured=(p_snapshot->>'funds_secured')::boolean,
    handover_started=(p_snapshot->>'handover_started')::boolean,
    inspection_started=(p_snapshot->>'inspection_started')::boolean,
    completed=(p_snapshot->>'completed')::boolean,
    cancelled=(p_snapshot->>'cancelled')::boolean,
    refunded=(p_snapshot->>'refunded')::boolean,
    rocket_fee_disbursed_minor=v_fee,
    escrow_fee_minor=(p_snapshot->>'escrow_fee_minor')::bigint,
    last_synced_at=now(),sync_attempts=sync_attempts+1,
    last_error=case when v_next='refunded' and v_fee>0 then 'Broker fee refund requires reconciliation' else null end,
    updated_at=now()
    where deal_id=p_deal_id;
  update public.rocket_deal_financials set
    escrow_provider='escrow.com',external_escrow_id=p_transaction_id::text,
    transaction_status=case v_next
      when 'funds_secured' then 'funds_secured'
      when 'handover' then 'transfer_in_progress'
      when 'inspection' then 'buyer_inspection'
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'refunded' then 'refunded'
      when 'disputed' then 'disputed'
      else 'escrow_initiated' end,
    provider_fee_minor=(p_snapshot->>'escrow_fee_minor')::bigint,
    fee_collected_minor=v_fee,
    fee_status=case when v_next='completed' and v_fee=total_rocket_fee_minor then 'collected'
      when v_next='completed' then 'pending_collection'
      when v_next in ('cancelled','refunded') and v_fee=0 then 'waived'
      else fee_status end,
    closed_at=case when v_next='completed' then coalesce(closed_at,now()) else closed_at end,
    updated_at=now() where deal_id=p_deal_id;
  if v_prior is distinct from v_next then
    insert into public.rocket_deal_escrow_events(deal_id,transaction_id,previous_status,next_status)
      values(p_deal_id,p_transaction_id,v_prior,v_next);
    v_title := case v_next
      when 'awaiting_acceptance' then 'Escrow needs your acceptance'
      when 'awaiting_payment' then 'Escrow is awaiting payment'
      when 'funds_secured' then 'Escrow funding confirmed'
      when 'handover' then 'Asset handover in progress'
      when 'inspection' then 'Buyer inspection started'
      when 'completed' then 'Acquisition completed'
      when 'cancelled' then 'Escrow transaction cancelled'
      when 'refunded' then 'Escrow payment refunded'
      else 'Escrow transaction needs attention' end;
    v_body := 'Escrow.com transaction ' || p_transaction_id::text || ' for your Rocket deal has changed status.';
    foreach v_recipient in array array[v_deal.buyer_id,v_deal.seller_id] loop
      insert into public.account_notifications(user_id,kind,title,body,href,event_key)
        values(v_recipient,'monetize',v_title,v_body,'/deals/' || p_deal_id::text,
          'rocket-escrow:' || p_deal_id::text || ':' || v_next)
        on conflict(user_id,event_key) do nothing;
    end loop;
  end if;
  return v_next;
end $$;
revoke all on function public.rocket_escrow_apply_snapshot(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.rocket_escrow_apply_snapshot(uuid,bigint,jsonb) to service_role;

create function public.rocket_escrow_record_sync_error(p_deal_id uuid,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.rocket_deal_escrow set last_error=left(coalesce(p_error,'Provider sync failed'),300),
    sync_attempts=sync_attempts+1,updated_at=now() where deal_id=p_deal_id;
end $$;
revoke all on function public.rocket_escrow_record_sync_error(uuid,text) from public,anon,authenticated;
grant execute on function public.rocket_escrow_record_sync_error(uuid,text) to service_role;

create or replace function public.rocket_admin_deal_financial_report() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or not coalesce(public.is_rocket_admin(),false) then
    raise exception 'Admin access denied' using errcode='42501'; end if;
  return jsonb_build_object(
    'currencies', coalesce((select jsonb_agg(row_to_json(s)) from (
      select currency,
        count(*) filter (where transaction_status='completed') as completed_acquisitions,
        count(*) filter (where transaction_status='cancelled') as cancelled_transactions,
        coalesce(sum(acquisition_price_minor) filter (where transaction_status='completed'),0) as completed_volume_minor,
        coalesce(sum(total_rocket_fee_minor) filter (where transaction_status='completed' and fee_status<>'waived'),0) as gross_earned_minor,
        coalesce(sum(fee_collected_minor),0) as fees_collected_minor,
        coalesce(sum(fee_refunded_minor),0) as fees_refunded_minor,
        coalesce(sum(total_rocket_fee_minor) filter (where transaction_status='completed' and fee_status='pending_collection'),0) as fees_outstanding_minor,
        coalesce(round(avg(acquisition_price_minor) filter (where transaction_status='completed')),0) as average_transaction_minor
      from public.rocket_deal_financials group by currency order by currency
    ) s),'[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(row_to_json(t)) from (
      select f.deal_id,f.currency,f.acquisition_price_minor,f.buyer_fee_minor,f.seller_fee_minor,
        f.total_rocket_fee_minor,f.fee_status,f.transaction_status,f.fee_collected_minor,
        f.fee_refunded_minor,f.provider_fee_minor,f.processing_fee_minor,f.escrow_provider,
        f.external_escrow_id,f.closed_at,f.updated_at,d.buyer_id,d.seller_id,a.name as app_name,
        e.environment,e.provider_status,
        e.attempt_status,e.last_synced_at,e.last_error
      from public.rocket_deal_financials f join public.rocket_deals d on d.id=f.deal_id
      join app_graph.apps a on a.id=d.app_id
      left join public.rocket_deal_escrow e on e.deal_id=f.deal_id
      order by f.updated_at desc limit 100
    ) t),'[]'::jsonb)
  );
end $$;
