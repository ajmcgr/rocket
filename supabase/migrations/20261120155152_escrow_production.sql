-- Select the provider environment atomically when claiming a deal.
-- Existing sandbox rows remain sandbox; only the service role may claim.
alter table public.rocket_deal_escrow
  drop constraint rocket_deal_escrow_transaction_id_key;
create unique index rocket_deal_escrow_environment_transaction_id_key
  on public.rocket_deal_escrow(environment, transaction_id)
  where transaction_id is not null;
drop function public.rocket_escrow_claim(uuid,uuid);
create function public.rocket_escrow_claim(p_deal_id uuid,p_actor uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_deal public.rocket_deals; v_fin public.rocket_deal_financials;
  v_agreement public.rocket_deal_agreements; v_checklist public.rocket_deal_checklists;
  v_existing public.rocket_deal_escrow; v_buyer_email text; v_seller_email text; v_name text;
  v_inspection text; v_days integer; v_quote jsonb;
begin
  if p_environment not in ('sandbox','production') or p_environment is null then
    raise exception 'Unsupported escrow environment' using errcode='22023'; end if;
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
    values(p_deal_id,p_environment,case when p_environment='production' then 'rp' else 'rk' end || substr(replace(p_deal_id::text,'-',''),1,22))
    returning * into v_existing;
  insert into public.rocket_deal_escrow_identity(deal_id,buyer_email,seller_email,app_name,inspection_days)
    values(p_deal_id,v_buyer_email,v_seller_email,v_name,v_days);
  return jsonb_build_object('claimed',true,'reference',v_existing.reference,
    'buyer_email',v_buyer_email,'seller_email',v_seller_email,'app_name',v_name,
    'price_minor',v_fin.acquisition_price_minor,'currency',v_fin.currency,
    'buyer_fee_minor',v_fin.buyer_fee_minor,'seller_fee_minor',v_fin.seller_fee_minor,
    'total_fee_minor',v_fin.total_rocket_fee_minor,'terms',v_agreement.terms,'checklist',v_checklist.items);
end $$;
revoke all on function public.rocket_escrow_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rocket_escrow_claim(uuid,uuid,text) to service_role;
