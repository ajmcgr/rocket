-- Reject manual financial state changes for Escrow.com managed deals.
create or replace function public.rocket_admin_record_deal_finance(
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
  -- Provider-managed financial states can only come from verified Escrow.com snapshots.
  if v_row.escrow_provider = 'escrow.com' or exists(
    select 1 from public.rocket_deal_escrow e where e.deal_id = p_deal_id
  ) or (p_action = 'escrow_initiated' and lower(btrim(coalesce(p_provider,''))) = 'escrow.com') then
    raise exception 'Escrow.com financial state requires provider reconciliation' using errcode = '42501';
  end if;
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
