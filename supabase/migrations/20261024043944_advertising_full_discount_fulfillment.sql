-- A verified, fully discounted Stripe Checkout is fulfilled without a
-- PaymentIntent. Only the existing service-role webhook can apply it.
alter table public.rocket_sponsorships
  drop constraint rocket_sponsorships_check3,
  add constraint rocket_sponsorships_check3
    check (paid_amount_cents is null or paid_amount_cents between 0 and amount_cents);

create or replace function public.apply_rocket_sponsorship_payment(
  p_event_id text, p_sponsorship_id uuid, p_session_id text,
  p_payment_intent_id text, p_price_id text, p_amount_cents integer,
  p_currency text, p_livemode boolean, p_paid_at timestamptz,
  p_fully_refunded boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_row public.rocket_sponsorships; v_price text; v_start timestamptz;
  v_duration interval;
begin
  select * into v_row from public.rocket_sponsorships
    where id=p_sponsorship_id for update;
  if not found then raise exception 'Unknown sponsorship'; end if;
  select case when p_livemode then live_price_id else test_price_id end into v_price
    from public.rocket_sponsorship_prices where product_code=v_row.sponsorship_type;
  if v_price is null or v_price<>p_price_id or v_row.stripe_livemode<>p_livemode
    or p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > v_row.amount_cents or p_currency<>'usd'
    or v_row.stripe_checkout_session_id is distinct from p_session_id
    or (p_amount_cents > 0 and (p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'))
    or (p_amount_cents = 0 and (p_payment_intent_id is not null or p_fully_refunded))
    or p_paid_at is null then raise exception 'Sponsorship payment mismatch'; end if;
  insert into public.rocket_sponsorship_webhook_events(event_id,sponsorship_id,event_type)
    values(p_event_id,v_row.id,'payment') on conflict do nothing;
  if not found then return false; end if;
  if v_row.status in ('cancelled','refunded') then
    raise exception 'Sponsorship no longer eligible for activation';
  end if;
  if v_row.stripe_payment_status='paid' then return false; end if;
  -- Stripe may deliver the refund event before checkout completion. Store the
  -- verified payment identity but never display an already-refunded booking.
  if p_fully_refunded then
    update public.rocket_sponsorships set
      stripe_payment_intent_id=p_payment_intent_id,
      stripe_payment_status='refunded', paid_at=p_paid_at,
      paid_amount_cents=p_amount_cents,
      status='refunded', actual_start_at=null, actual_end_at=null
      where id=v_row.id;
    return true;
  end if;
  v_duration := case when v_row.sponsorship_type='featured_app'
    then interval '7 days' else interval '30 days' end;
  -- A delayed webhook must not shorten the purchased 7/30 days of display.
  v_start := greatest(v_row.scheduled_start_at,now());
  update public.rocket_sponsorships set
    stripe_payment_intent_id=p_payment_intent_id,stripe_payment_status='paid',
    paid_at=p_paid_at,paid_amount_cents=p_amount_cents,
    actual_start_at=v_start,actual_end_at=v_start+v_duration,
    scheduled_start_at=v_start,scheduled_end_at=v_start+v_duration,
    status=case when v_start<=now() then 'active' else 'scheduled' end
  where id=v_row.id;
  return true;
end;
$$;
