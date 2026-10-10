-- Rocket-owned, one-time advertising. No marketplace purchase, entitlement,
-- developer membership, verified-revenue or editorial table is written here.
create table public.rocket_sponsorship_prices (
  product_code text primary key check (product_code in ('featured_app', 'category_sponsor')),
  live_product_id text unique check (live_product_id ~ '^prod_[A-Za-z0-9]+$'),
  test_product_id text unique check (test_product_id ~ '^prod_[A-Za-z0-9]+$'),
  live_price_id text unique check (live_price_id ~ '^price_[A-Za-z0-9]+$'),
  test_price_id text unique check (test_price_id ~ '^price_[A-Za-z0-9]+$'),
  updated_at timestamptz not null default now()
);
insert into public.rocket_sponsorship_prices
  (product_code, live_product_id, test_product_id, live_price_id, test_price_id)
values
  ('featured_app', 'prod_VPpT7ZvZ1n695B', 'prod_VPpRNA6smwqpJI',
    'price_1UOzoyL9pkHWyRRutvY1m6lh', 'price_1UOzmkL9pkHWyRRuHy7bzZcv'),
  ('category_sponsor', 'prod_VPpVEhhqZEynvh', 'prod_VPpSktWhfoBzdB',
    'price_1UOzqHL9pkHWyRRujXLMeIEA', 'price_1UOznjL9pkHWyRRuPVeScC7g');

create table public.rocket_sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsorship_type text not null check (sponsorship_type in ('featured_app', 'category_sponsor')),
  purchaser_user_id uuid not null references auth.users(id),
  purchaser_email text,
  target_app_id uuid not null references app_graph.apps(id),
  target_category text,
  slot_key text generated always as (
    (case when stripe_livemode then 'live:' else 'test:' end) ||
    (case when sponsorship_type = 'featured_app' then 'featured_app'
      else 'category:' || target_category end)
  ) stored,
  stripe_livemode boolean not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_payment_status text not null default 'unpaid'
    check (stripe_payment_status in ('unpaid', 'paid', 'refunded')),
  amount_cents integer not null,
  currency text not null default 'usd' check (currency = 'usd'),
  scheduled_start_at timestamptz not null,
  scheduled_end_at timestamptz not null,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  hold_expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'active', 'cancelled', 'refunded')),
  moderation_hold boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((sponsorship_type = 'featured_app' and target_category is null and amount_cents = 4900)
    or (sponsorship_type = 'category_sponsor' and target_category is not null
      and length(target_category) between 1 and 120 and amount_cents = 29900)),
  check (scheduled_end_at > scheduled_start_at),
  check ((status in ('scheduled', 'active') and stripe_payment_status = 'paid')
    or status not in ('scheduled', 'active')),
  check (stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$'),
  check (stripe_payment_intent_id is null or stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$')
);
create index rocket_sponsorships_user_idx on public.rocket_sponsorships(purchaser_user_id, created_at desc);
create index rocket_sponsorships_slot_idx on public.rocket_sponsorships(slot_key, scheduled_end_at)
  where status in ('pending', 'scheduled', 'active');

-- Even a service-role write must not double-book a slot. The transaction lock
-- serializes simultaneous checkouts and webhook state changes for that slot.
create function public.check_rocket_sponsorship_inventory()
returns trigger language plpgsql set search_path = '' as $$
declare v_slot text;
begin
  v_slot := (case when new.stripe_livemode then 'live:' else 'test:' end) ||
    (case when new.sponsorship_type='featured_app' then 'featured_app'
      else 'category:' || new.target_category end);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_slot)::bigint);
  if new.status in ('pending', 'scheduled', 'active') and exists (
    select 1 from public.rocket_sponsorships s
    where s.slot_key = v_slot and s.id <> new.id
      and s.status in ('pending', 'scheduled', 'active')
      and pg_catalog.tstzrange(s.scheduled_start_at, s.scheduled_end_at, '[)')
        && pg_catalog.tstzrange(new.scheduled_start_at, new.scheduled_end_at, '[)')
  ) then
    raise exception 'Sponsorship inventory is unavailable' using errcode = '23P01';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger check_rocket_sponsorship_inventory
  before insert or update on public.rocket_sponsorships
  for each row execute function public.check_rocket_sponsorship_inventory();

create table public.rocket_sponsorship_webhook_events (
  event_id text primary key,
  sponsorship_id uuid not null references public.rocket_sponsorships(id),
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.rocket_sponsorship_prices enable row level security;
alter table public.rocket_sponsorships enable row level security;
alter table public.rocket_sponsorship_webhook_events enable row level security;
revoke all on public.rocket_sponsorship_prices, public.rocket_sponsorships,
  public.rocket_sponsorship_webhook_events from public, anon, authenticated;
grant all on public.rocket_sponsorship_prices, public.rocket_sponsorships,
  public.rocket_sponsorship_webhook_events to service_role;

-- Only verified, paid, unheld, in-window campaigns can render. The result
-- contains no purchaser, payment or private management fields.
create function public.active_rocket_sponsorships(p_category text default null)
returns table(
  sponsorship_id uuid, sponsorship_type text, app_id uuid, category text,
  starts_at timestamptz, ends_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select s.id, s.sponsorship_type, s.target_app_id, s.target_category,
    s.actual_start_at, s.actual_end_at
  from public.rocket_sponsorships s
  join public.public_discoverable_apps a on a.id = s.target_app_id
  where s.stripe_livemode and s.stripe_payment_status = 'paid'
    and exists(select 1 from public.app_owners o where o.app_id = s.target_app_id
      and o.user_id = s.purchaser_user_id and o.revoked_at is null)
    and s.status in ('scheduled','active') and not s.moderation_hold
    and (s.sponsorship_type='featured_app' or s.target_category=any(a.categories))
    and s.actual_start_at <= now() and s.actual_end_at > now()
    and (p_category is null or s.target_category = p_category)
  order by s.actual_start_at, s.id;
$$;
revoke all on function public.active_rocket_sponsorships(text) from public;
grant execute on function public.active_rocket_sponsorships(text) to anon, authenticated, service_role;

-- Called by the advertising Edge Function after authenticating the buyer.
-- A pending Checkout is the sole hold for a slot until it is paid or expired.
create function public.reserve_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text,
  p_livemode boolean, p_email text
) returns public.rocket_sponsorships
language plpgsql security invoker set search_path = '' as $$
declare v_slot text; v_start timestamptz; v_duration interval;
  v_row public.rocket_sponsorships; v_app public.public_discoverable_apps%rowtype;
begin
  if p_type not in ('featured_app','category_sponsor') or p_user_id is null
    or p_app_id is null then raise exception 'Invalid sponsorship request'; end if;
  select * into v_app from public.public_discoverable_apps where id = p_app_id;
  if not found or not exists (
    select 1 from public.app_owners o where o.app_id = p_app_id
      and o.user_id = p_user_id and o.revoked_at is null
  ) then raise exception 'Eligible owned app required' using errcode='42501'; end if;
  if p_type = 'category_sponsor' then
    if p_category is null or not (p_category = any(v_app.categories))
      then raise exception 'App must belong to the sponsored category'; end if;
    v_slot := (case when p_livemode then 'live:' else 'test:' end) || 'category:' || p_category;
    v_duration := interval '30 days';
  else
    if p_category is not null then raise exception 'Unexpected category'; end if;
    v_slot := (case when p_livemode then 'live:' else 'test:' end) || 'featured_app';
    v_duration := interval '7 days';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_slot)::bigint);
  if exists(select 1 from public.rocket_sponsorships where slot_key=v_slot and status='pending')
    then raise exception 'Sponsorship inventory is temporarily held' using errcode='23P01'; end if;
  select greatest(now(), coalesce(max(scheduled_end_at), now())) into v_start
    from public.rocket_sponsorships
    where slot_key=v_slot and status in ('scheduled','active');
  insert into public.rocket_sponsorships(
    sponsorship_type,purchaser_user_id,purchaser_email,target_app_id,
    target_category,stripe_livemode,amount_cents,scheduled_start_at,
    scheduled_end_at,hold_expires_at
  ) values (
    p_type,p_user_id,p_email,p_app_id,p_category,p_livemode,
    case when p_type='featured_app' then 4900 else 29900 end,
    v_start,v_start+v_duration,now()+interval '31 minutes'
  ) returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.reserve_rocket_sponsorship(uuid,text,uuid,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.reserve_rocket_sponsorship(uuid,text,uuid,text,boolean,text)
  to service_role;

create function public.quote_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text, p_livemode boolean
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_slot text; v_start timestamptz; v_duration interval;
  v_categories text[];
begin
  select a.categories into v_categories from public.public_discoverable_apps a
    join public.app_owners o on o.app_id=a.id and o.user_id=p_user_id
      and o.revoked_at is null
    where a.id=p_app_id;
  if not found then raise exception 'Eligible owned app required' using errcode='42501'; end if;
  if p_type='featured_app' and p_category is null then
    v_slot := (case when p_livemode then 'live:' else 'test:' end) || 'featured_app'; v_duration := interval '7 days';
  elsif p_type='category_sponsor' and p_category=any(v_categories) then
    v_slot := (case when p_livemode then 'live:' else 'test:' end) || 'category:'||p_category; v_duration := interval '30 days';
  else raise exception 'Invalid sponsorship target'; end if;
  if exists(select 1 from public.rocket_sponsorships
    where slot_key=v_slot and status='pending') then
    return jsonb_build_object('available',false,'reason','A checkout is holding this slot');
  end if;
  select greatest(now(),coalesce(max(scheduled_end_at),now())) into v_start
    from public.rocket_sponsorships
    where slot_key=v_slot and status in ('scheduled','active');
  return jsonb_build_object('available',true,'start',v_start,
    'end',v_start+v_duration,'amount_cents',
    case when p_type='featured_app' then 4900 else 29900 end,
    'currency','usd');
end;
$$;
revoke all on function public.quote_rocket_sponsorship(uuid,text,uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.quote_rocket_sponsorship(uuid,text,uuid,text,boolean)
  to service_role;

create function public.cancel_rocket_sponsorship_reservation(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.rocket_sponsorships set status='cancelled'
    where id=p_id and status='pending' and stripe_payment_status='unpaid';
  return found;
end;
$$;
revoke all on function public.cancel_rocket_sponsorship_reservation(uuid)
  from public,anon,authenticated;
grant execute on function public.cancel_rocket_sponsorship_reservation(uuid)
  to service_role;

create function public.apply_rocket_sponsorship_payment(
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
    or v_row.amount_cents<>p_amount_cents or p_currency<>'usd'
    or v_row.stripe_checkout_session_id is distinct from p_session_id
    or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
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
    paid_at=p_paid_at,actual_start_at=v_start,actual_end_at=v_start+v_duration,
    scheduled_start_at=v_start,scheduled_end_at=v_start+v_duration,
    status=case when v_start<=now() then 'active' else 'scheduled' end
  where id=v_row.id;
  return true;
end;
$$;
revoke all on function public.apply_rocket_sponsorship_payment(text,uuid,text,text,text,integer,text,boolean,timestamptz,boolean)
  from public, anon, authenticated;
grant execute on function public.apply_rocket_sponsorship_payment(text,uuid,text,text,text,integer,text,boolean,timestamptz,boolean)
  to service_role;

create function public.apply_rocket_sponsorship_refund(
  p_event_id text, p_payment_intent_id text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.rocket_sponsorships
    where stripe_payment_intent_id=p_payment_intent_id for update;
  if not found then return false; end if;
  insert into public.rocket_sponsorship_webhook_events(event_id,sponsorship_id,event_type)
    values(p_event_id,v_id,'refund') on conflict do nothing;
  if not found then return false; end if;
  update public.rocket_sponsorships set stripe_payment_status='refunded',
    status='refunded',actual_end_at=least(coalesce(actual_end_at,now()),now())
    where id=v_id;
  return true;
end;
$$;
revoke all on function public.apply_rocket_sponsorship_refund(text,text)
  from public, anon, authenticated;
grant execute on function public.apply_rocket_sponsorship_refund(text,text) to service_role;

-- Admin may halt display, but cannot manufacture payment or a paid booking.
create function public.rocket_admin_sponsorships()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_rocket_admin() then coalesce(jsonb_agg(
    jsonb_build_object('id',s.id,'type',s.sponsorship_type,
      'app_id',s.target_app_id,'app_name',a.name,'category',s.target_category,
      'buyer',s.purchaser_email,'amount_cents',s.amount_cents,
      'payment_status',s.stripe_payment_status,'status',
        case when s.status in ('active','scheduled') and s.actual_end_at<=now()
          then 'expired' else s.status end,
      'start',s.actual_start_at,'end',s.actual_end_at,
      'moderation_hold',s.moderation_hold)
    order by s.created_at desc), '[]'::jsonb)
  else null end
  from public.rocket_sponsorships s
  left join app_graph.apps a on a.id=s.target_app_id;
$$;
revoke all on function public.rocket_admin_sponsorships() from public, anon;
grant execute on function public.rocket_admin_sponsorships() to authenticated, service_role;

create function public.rocket_admin_sponsorship_hold(p_id uuid,p_hold boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  update public.rocket_sponsorships set moderation_hold=p_hold where id=p_id;
  if not found then return false; end if;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(auth.uid(),case when p_hold then 'hold_sponsorship' else 'release_sponsorship' end,
      'sponsorship',p_id::text,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.rocket_admin_sponsorship_hold(uuid,boolean)
  from public, anon;
grant execute on function public.rocket_admin_sponsorship_hold(uuid,boolean)
  to authenticated, service_role;

notify pgrst, 'reload schema';
