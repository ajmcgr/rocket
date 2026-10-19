begin;
do $$
declare v_app uuid; v_user uuid; v_category text; v_row public.rocket_sponsorships;
  v_ids uuid[] := '{}'; v_categories uuid[] := '{}'; v_seen uuid[] := '{}';
  v_payload jsonb; v_item jsonb; v_legacy uuid; v_legacy_slot text; v_i integer;
  v_before jsonb; v_after jsonb; v_fail boolean := false;
begin
  select o.app_id,o.user_id,a.categories[1] into strict v_app,v_user,v_category
    from public.app_owners o join public.public_discoverable_apps a on a.id=o.app_id
    where o.revoked_at is null and cardinality(a.categories)>0 limit 1;
  select jsonb_agg(to_jsonb(s) order by id) into v_before from public.rocket_sponsorships s;
  select id,homepage_slot_id into v_legacy,v_legacy_slot from public.rocket_sponsorships
    where stripe_livemode and sponsorship_type='featured_app' and not shared_rotation
      and stripe_payment_status='paid' and actual_start_at<=now() and actual_end_at>now() limit 1;
  for v_i in 1..24 loop
    v_row := public.reserve_rocket_sponsorship(v_user,'featured_app',v_app,null,true,null);
    if not v_row.shared_rotation or v_row.scheduled_start_at<>now() then raise exception 'Shared immediate booking expected'; end if;
    v_ids := array_append(v_ids,v_row.id);
    update public.rocket_sponsorships set status='active',stripe_payment_status='paid',
      actual_start_at=now(),actual_end_at=now()+interval '7 days' where id=v_row.id;
  end loop;
  for v_i in 1..12 loop
    v_row := public.reserve_rocket_sponsorship(v_user,'category_sponsor',v_app,v_category,true,null);
    v_categories := array_append(v_categories,v_row.id);
    if v_row.scheduled_start_at<>now() then raise exception 'Shared category should not queue behind shared bookings'; end if;
    update public.rocket_sponsorships set status='active',stripe_payment_status='paid',
      actual_start_at=now(),actual_end_at=now()+interval '30 days' where id=v_row.id;
  end loop;
  for v_i in 1..100 loop
    v_payload := public.rocket_rotating_ad_placements(null);
    if jsonb_array_length(v_payload->'placements')<>8 then raise exception 'Expected eight display positions'; end if;
    if v_legacy is not null and not exists(select 1 from jsonb_array_elements(v_payload->'placements') p
      where p->>'sponsorship_id'=v_legacy::text and p->>'homepage_slot_id'=v_legacy_slot)
      then raise exception 'Existing paid position lost'; end if;
    if (select count(distinct p->>'homepage_slot_id') from jsonb_array_elements(v_payload->'placements') p)<>8
      then raise exception 'Duplicate display positions'; end if;
    for v_item in select * from jsonb_array_elements(v_payload->'placements') loop
      if v_item ? 'purchaser_email' or v_item ? 'stripe_payment_status' then raise exception 'Private field exposed'; end if;
      if (v_item->>'sponsorship_id')::uuid=any(v_ids) and not (v_item->>'sponsorship_id')::uuid=any(v_seen)
        then v_seen:=array_append(v_seen,(v_item->>'sponsorship_id')::uuid); end if;
    end loop;
    v_payload:=public.rocket_rotating_ad_placements(v_category);
    if jsonb_array_length(v_payload->'placements')<>1 then raise exception 'Expected one category ad per request'; end if;
  end loop;
  if cardinality(v_seen)<>24 then raise exception 'Rotation starved a booking'; end if;
  -- Unpaid, expired, held, refunded and wrong-category campaigns never serve.
  update public.rocket_sponsorships set moderation_hold=true where id=any(v_ids);
  update public.rocket_sponsorships set moderation_hold=false, actual_start_at=now()-interval '8 days', actual_end_at=now()-interval '1 second' where id=v_ids[1];
  update public.rocket_sponsorships set moderation_hold=false,status='pending',stripe_payment_status='unpaid' where id=v_ids[2];
  update public.rocket_sponsorships set moderation_hold=false,status='cancelled' where id=v_ids[3];
  update public.rocket_sponsorships set status='refunded',stripe_payment_status='refunded' where id=any(v_categories);
  v_payload:=public.rocket_rotating_ad_placements(null);
  if exists(select 1 from jsonb_array_elements(v_payload->'placements') p where (p->>'sponsorship_id')::uuid=any(v_ids))
    then raise exception 'Ineligible campaign served'; end if;
  v_payload:=public.rocket_rotating_ad_placements(v_category);
  if exists(select 1 from jsonb_array_elements(v_payload->'placements') p where (p->>'sponsorship_id')::uuid=any(v_categories))
    then raise exception 'Refunded campaign served'; end if;
  if jsonb_array_length(public.rocket_rotating_ad_placements('__not_a_rocket_category__')->'placements')<>0
    then raise exception 'Wrong-category campaign served'; end if;
  begin
    perform public.reserve_rocket_sponsorship(gen_random_uuid(),'featured_app',v_app,null,true,null);
  exception when insufficient_privilege then v_fail:=true;
  end;
  if not v_fail then raise exception 'Ownership protection missing'; end if;
  select jsonb_agg(to_jsonb(s) order by id) into v_after from public.rocket_sponsorships s
    where not(id=any(v_ids)) and not(id=any(v_categories));
  if v_before is distinct from v_after then raise exception 'Existing bookings changed'; end if;
end;
$$;
rollback;
