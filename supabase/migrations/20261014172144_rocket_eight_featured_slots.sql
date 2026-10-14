-- Preserve every existing booking and its payment history. Existing Featured
-- App bookings occupied the original single position and become position 1.
alter table public.rocket_sponsorships add column homepage_slot_id text;
update public.rocket_sponsorships set homepage_slot_id = 'homepage_featured_1'
  where sponsorship_type = 'featured_app';
alter table public.rocket_sponsorships add constraint rocket_sponsorship_homepage_slot_check
  check ((sponsorship_type = 'featured_app' and homepage_slot_id is not null and homepage_slot_id in (
    'homepage_featured_1','homepage_featured_2','homepage_featured_3','homepage_featured_4',
    'homepage_featured_5','homepage_featured_6','homepage_featured_7','homepage_featured_8'))
    or (sponsorship_type = 'category_sponsor' and homepage_slot_id is null));
create index rocket_sponsorship_homepage_slot_idx on public.rocket_sponsorships
  (stripe_livemode, homepage_slot_id, scheduled_end_at)
  where sponsorship_type = 'featured_app' and status in ('pending','scheduled','active');

-- The trigger is the final inventory authority for every write, including
-- service-role writes and delayed webhook updates. Category locking is unchanged.
create or replace function public.check_rocket_sponsorship_inventory()
returns trigger language plpgsql set search_path = '' as $$
declare v_slot text;
begin
  v_slot := (case when new.stripe_livemode then 'live:' else 'test:' end) ||
    (case when new.sponsorship_type = 'featured_app' then new.homepage_slot_id
      else 'category:' || new.target_category end);
  if v_slot is null then raise exception 'Sponsorship slot required' using errcode = '23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_slot)::bigint);
  if new.status in ('pending','scheduled','active') and exists (
    select 1 from public.rocket_sponsorships s
    where s.id <> new.id and s.stripe_livemode = new.stripe_livemode
      and s.status in ('pending','scheduled','active')
      and ((new.sponsorship_type = 'featured_app' and s.sponsorship_type = 'featured_app'
          and s.homepage_slot_id = new.homepage_slot_id)
        or (new.sponsorship_type = 'category_sponsor' and s.slot_key = v_slot))
      and pg_catalog.tstzrange(s.scheduled_start_at,s.scheduled_end_at,'[)')
        && pg_catalog.tstzrange(new.scheduled_start_at,new.scheduled_end_at,'[)')
  ) then
    raise exception 'Sponsorship inventory is unavailable' using errcode = '23P01';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- A short transaction-level allocation lock serializes buyers across all
-- eight positions. This keeps slot selection server-side and lowest-first.
create or replace function public.reserve_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text,
  p_livemode boolean, p_email text
) returns public.rocket_sponsorships
language plpgsql security invoker set search_path = '' as $$
declare v_slot text; v_start timestamptz; v_duration interval;
  v_number integer; v_homepage_slot text; v_available boolean := false;
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
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_slot)::bigint);
    if exists(select 1 from public.rocket_sponsorships where slot_key=v_slot and status='pending')
      then raise exception 'Sponsorship inventory is temporarily held' using errcode='23P01'; end if;
    select greatest(now(),coalesce(max(scheduled_end_at),now())) into v_start
      from public.rocket_sponsorships where slot_key=v_slot and status in ('scheduled','active');
  else
    if p_category is not null then raise exception 'Unexpected category'; end if;
    v_duration := interval '7 days';
    v_start := now();
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      (case when p_livemode then 'live:' else 'test:' end) || 'featured_allocation')::bigint);
    for v_number in 1..8 loop
      v_homepage_slot := 'homepage_featured_' || v_number;
      if not exists (
        select 1 from public.rocket_sponsorships s
        where s.sponsorship_type = 'featured_app' and s.stripe_livemode = p_livemode
          and s.homepage_slot_id = v_homepage_slot
          and s.status in ('pending','scheduled','active')
          and pg_catalog.tstzrange(s.scheduled_start_at,s.scheduled_end_at,'[)')
            && pg_catalog.tstzrange(v_start,v_start+v_duration,'[)')
      ) then v_available := true; exit; end if;
    end loop;
    if not v_available then raise exception 'Featured App is currently sold out' using errcode='23P01'; end if;
  end if;
  insert into public.rocket_sponsorships(
    sponsorship_type,purchaser_user_id,purchaser_email,target_app_id,
    target_category,homepage_slot_id,stripe_livemode,amount_cents,
    scheduled_start_at,scheduled_end_at,hold_expires_at
  ) values (
    p_type,p_user_id,p_email,p_app_id,p_category,v_homepage_slot,p_livemode,
    case when p_type='featured_app' then 4900 else 29900 end,
    v_start,v_start+v_duration,now()+interval '31 minutes'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.quote_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text, p_livemode boolean
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_slot text; v_start timestamptz; v_duration interval;
  v_categories text[]; v_number integer; v_homepage_slot text; v_available boolean := false;
begin
  select a.categories into v_categories from public.public_discoverable_apps a
    join public.app_owners o on o.app_id=a.id and o.user_id=p_user_id
      and o.revoked_at is null where a.id=p_app_id;
  if not found then raise exception 'Eligible owned app required' using errcode='42501'; end if;
  if p_type='featured_app' and p_category is null then
    v_duration := interval '7 days'; v_start := now();
    for v_number in 1..8 loop
      v_homepage_slot := 'homepage_featured_' || v_number;
      if not exists (
        select 1 from public.rocket_sponsorships s
        where s.sponsorship_type='featured_app' and s.stripe_livemode=p_livemode
          and s.homepage_slot_id=v_homepage_slot
          and s.status in ('pending','scheduled','active')
          and pg_catalog.tstzrange(s.scheduled_start_at,s.scheduled_end_at,'[)')
            && pg_catalog.tstzrange(v_start,v_start+v_duration,'[)')
      ) then v_available := true; exit; end if;
    end loop;
    if not v_available then
      return pg_catalog.jsonb_build_object('available',false,
        'reason','Featured App is currently sold out');
    end if;
  elsif p_type='category_sponsor' and p_category=any(v_categories) then
    v_slot := (case when p_livemode then 'live:' else 'test:' end) || 'category:'||p_category;
    v_duration := interval '30 days';
    if exists(select 1 from public.rocket_sponsorships where slot_key=v_slot and status='pending')
      then return pg_catalog.jsonb_build_object('available',false,'reason','A checkout is holding this slot'); end if;
    select greatest(now(),coalesce(max(scheduled_end_at),now())) into v_start
      from public.rocket_sponsorships where slot_key=v_slot and status in ('scheduled','active');
  else raise exception 'Invalid sponsorship target'; end if;
  return pg_catalog.jsonb_build_object('available',true,'start',v_start,
    'end',v_start+v_duration,'amount_cents',
    case when p_type='featured_app' then 4900 else 29900 end,
    'currency','usd','homepage_slot_id',v_homepage_slot);
end;
$$;

-- Public count exposes only free inventory, never buyer or payment records.
create function public.rocket_featured_available_slots(p_livemode boolean)
returns integer language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from pg_catalog.generate_series(1,8) n
  where not exists (
    select 1 from public.rocket_sponsorships s
    where s.sponsorship_type='featured_app' and s.stripe_livemode=p_livemode
      and s.homepage_slot_id='homepage_featured_'||n
      and s.status in ('pending','scheduled','active')
      and pg_catalog.tstzrange(s.scheduled_start_at,s.scheduled_end_at,'[)')
        && pg_catalog.tstzrange(now(),now()+interval '7 days','[)')
  );
$$;
revoke all on function public.rocket_featured_available_slots(boolean) from public,anon,authenticated;
grant execute on function public.rocket_featured_available_slots(boolean) to service_role;

-- Existing metrics remain counted as homepage views. The placement dimension
-- keeps homepage and shared-footer reporting distinct without retaining PII.
alter table public.rocket_sponsorship_metrics add column placement_type text not null default 'homepage'
  check (placement_type in ('homepage','footer','category'));
update public.rocket_sponsorship_metrics m set placement_type = 'category'
  from public.rocket_sponsorships s
  where s.id = m.sponsorship_id and s.sponsorship_type = 'category_sponsor';
alter table public.rocket_sponsorship_metrics drop constraint rocket_sponsorship_metrics_pkey;
alter table public.rocket_sponsorship_metrics add primary key
  (sponsorship_id,event_type,event_day,visitor_hash,placement_type);

create function public.record_rocket_sponsorship_metric(
  p_sponsorship_id uuid, p_app_id uuid, p_event_type text,
  p_visitor_hash text, p_placement_type text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_event_type not in ('view','click')
    or p_placement_type not in ('homepage','footer','category')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.active_rocket_sponsorships(null) a
      where a.sponsorship_id=p_sponsorship_id and a.app_id=p_app_id
        and ((a.sponsorship_type='category_sponsor' and p_placement_type='category')
          or (a.sponsorship_type='featured_app' and p_placement_type in ('homepage','footer')))
    ) then return false;
  end if;
  insert into public.rocket_sponsorship_metrics
    (sponsorship_id,event_type,visitor_hash,placement_type)
    values(p_sponsorship_id,p_event_type,p_visitor_hash,p_placement_type)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.record_rocket_sponsorship_metric(uuid,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_rocket_sponsorship_metric(uuid,uuid,text,text,text)
  to service_role;

-- Keep the earlier four-argument recorder correct during the Edge rollout.
create or replace function public.record_rocket_sponsorship_metric(
  p_sponsorship_id uuid, p_app_id uuid, p_event_type text, p_visitor_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_type text;
begin
  select sponsorship_type into v_type from public.rocket_sponsorships
    where id = p_sponsorship_id;
  return public.record_rocket_sponsorship_metric(
    p_sponsorship_id, p_app_id, p_event_type, p_visitor_hash,
    case when v_type = 'category_sponsor' then 'category' else 'homepage' end);
end;
$$;

notify pgrst, 'reload schema';
