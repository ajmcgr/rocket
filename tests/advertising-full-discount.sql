-- Run after the migration inside BEGIN/ROLLBACK; no fixtures are committed.
insert into auth.users(id,email,email_confirmed_at) values
  ('a2400000-0000-4000-8000-000000000001','ad-discount-test@example.invalid',now());
insert into app_graph.apps(id,seed_source_type,seed_source_external_id,name,website_url,canonical_host,source_hash,slug,is_public) values
  ('b2400000-0000-4000-8000-000000000001','website','ad-discount-test','Ad discount test','https://example.invalid/ad-discount','example.invalid','test','ad-discount-test',false);
insert into public.rocket_sponsorships(id,sponsorship_type,purchaser_user_id,target_app_id,
  stripe_livemode,stripe_checkout_session_id,amount_cents,scheduled_start_at,scheduled_end_at,
  hold_expires_at,homepage_slot_id,shared_rotation)
select id::uuid,'featured_app','a2400000-0000-4000-8000-000000000001',
  'b2400000-0000-4000-8000-000000000001',false,session_id,4900,
  now()-interval '1 hour',now()+interval '6 days',now()+interval '1 hour','homepage_featured_1',true
from (values
  ('c2400000-0000-4000-8000-000000000001','cs_test_AdDiscount'),
  ('c2400000-0000-4000-8000-000000000002','cs_test_AdPaid')
) fixtures(id,session_id);

do $$
declare price text; booking public.rocket_sponsorships; start_at timestamptz;
  signature text := 'public.apply_rocket_sponsorship_payment(text,uuid,text,text,text,integer,text,boolean,timestamptz,boolean)';
begin
  if has_function_privilege('anon',signature,'execute')
    or has_function_privilege('authenticated',signature,'execute')
    or not has_function_privilege('service_role',signature,'execute') then
    raise exception 'Fulfillment must remain service-role only';
  end if;
  select test_price_id into price from public.rocket_sponsorship_prices where product_code='featured_app';
  begin
    perform public.apply_rocket_sponsorship_payment('evt_testAdMissingIntent','c2400000-0000-4000-8000-000000000002','cs_test_AdPaid',null,price,4900,'usd',false,now(),false);
    raise exception 'Positive payment accepted without intent';
  exception when raise_exception then
    if sqlerrm <> 'Sponsorship payment mismatch' then raise; end if;
  end;
  begin
    perform public.apply_rocket_sponsorship_payment('evt_testAdUnexpectedIntent','c2400000-0000-4000-8000-000000000001','cs_test_AdDiscount','pi_unexpected',price,0,'usd',false,now(),false);
    raise exception 'Zero payment accepted with intent';
  exception when raise_exception then
    if sqlerrm <> 'Sponsorship payment mismatch' then raise; end if;
  end;
  begin
    perform public.apply_rocket_sponsorship_payment('evt_testAdWrongSession','c2400000-0000-4000-8000-000000000001','cs_test_wrong',null,price,0,'usd',false,now(),false);
    raise exception 'Wrong session accepted';
  exception when raise_exception then
    if sqlerrm <> 'Sponsorship payment mismatch' then raise; end if;
  end;
  if not public.apply_rocket_sponsorship_payment('evt_testAdFullDiscount','c2400000-0000-4000-8000-000000000001','cs_test_AdDiscount',null,price,0,'usd',false,now()-interval '1 hour',false) then
    raise exception 'Fully discounted order was not fulfilled';
  end if;
  select * into booking from public.rocket_sponsorships where id='c2400000-0000-4000-8000-000000000001';
  if booking.status <> 'active' or booking.stripe_payment_status <> 'paid'
    or booking.paid_amount_cents <> 0 or booking.stripe_payment_intent_id is not null
    or booking.actual_start_at < now()
    or booking.actual_end_at-booking.actual_start_at <> interval '7 days' then
    raise exception 'Incorrect free order activation or duration';
  end if;
  start_at := booking.actual_start_at;
  if public.apply_rocket_sponsorship_payment('evt_testAdFullDiscount','c2400000-0000-4000-8000-000000000001','cs_test_AdDiscount',null,price,0,'usd',false,now(),false) then
    raise exception 'Duplicate delivery applied twice';
  end if;
  if public.apply_rocket_sponsorship_payment('evt_testAdSecondDelivery','c2400000-0000-4000-8000-000000000001','cs_test_AdDiscount',null,price,0,'usd',false,now(),false) then
    raise exception 'Second event extended the booking';
  end if;
  if (select actual_start_at from public.rocket_sponsorships where id=booking.id) is distinct from start_at then
    raise exception 'Duplicate changed the display window';
  end if;
  if not public.apply_rocket_sponsorship_payment('evt_testAdPartialDiscount','c2400000-0000-4000-8000-000000000002','cs_test_AdPaid','pi_testAdPaid',price,3920,'usd',false,now(),false) then
    raise exception 'Positive charge regression';
  end if;
  raise notice 'PASS: full discount, positive charge, session/intent guards, service-only access, idempotency and full duration';
end;
$$;
