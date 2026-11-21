-- Keep historical non-USD offers and financial records readable. New offers
-- and progression toward escrow must use USD while Escrow.com is USD-only.
create or replace function deals_private.validate_offer_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.currency <> 'USD' then
    raise exception 'Secure acquisition transactions currently support USD only. Create a new USD offer.' using errcode = '22023';
  end if;
  perform deals_private.rocket_closing_fee(new.amount_cents,new.currency);
  return new;
end $$;

create or replace function deals_private.lock_accepted_offer_fee() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_offer public.rocket_deal_offers; v_quote jsonb;
begin
  if new.event <> 'accepted' then return new; end if;
  select * into v_offer from public.rocket_deal_offers where id = (new.detail->>'offer_id')::uuid
    and deal_id = new.deal_id;
  if v_offer.id is null then raise exception 'Accepted offer missing' using errcode = '22023'; end if;
  if v_offer.currency <> 'USD' then
    raise exception 'Secure acquisition transactions currently support USD only. This existing offer cannot be accepted.' using errcode = '22023';
  end if;
  v_quote := deals_private.rocket_closing_fee(v_offer.amount_cents,v_offer.currency);
  insert into public.rocket_deal_financials (
    deal_id,accepted_offer_id,acquisition_price_minor,currency,minor_digits,buyer_fee_minor,seller_fee_minor,
    total_rocket_fee_minor,buyer_total_minor,seller_net_minor,fee_version,usd_minimum_applied
  ) values (
    new.deal_id,v_offer.id,v_offer.amount_cents,v_offer.currency,(v_quote->>'minor_digits')::integer,
    (v_quote->>'buyer_fee_minor')::bigint,(v_quote->>'seller_fee_minor')::bigint,
    (v_quote->>'total_rocket_fee_minor')::bigint,(v_quote->>'buyer_total_minor')::bigint,
    (v_quote->>'seller_net_minor')::bigint,1,(v_quote->>'usd_minimum_applied')::boolean
  );
  return new;
end $$;

create function deals_private.require_usd_for_escrow_progression() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_currency text;
begin
  if new.status is distinct from old.status and new.status in ('terms_agreed','awaiting_escrow') then
    select currency into v_currency from public.rocket_deal_financials where deal_id = new.id;
    if v_currency is null then
      select currency into v_currency from public.rocket_deal_offers
        where deal_id = new.id order by sequence desc limit 1;
    end if;
    if v_currency is distinct from 'USD' then
      raise exception 'Secure acquisition transactions currently support USD only. This existing deal cannot proceed to escrow.' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function deals_private.require_usd_for_escrow_progression() from public, anon, authenticated;
create trigger rocket_deal_usd_escrow_progression before update of status on public.rocket_deals
  for each row execute function deals_private.require_usd_for_escrow_progression();
