-- Existing bookings retain their reserved/exclusive terms. Only new purchases
-- opt into shared rotation; no ownership, payment or campaign history is rewritten.
alter table public.rocket_sponsorships add column shared_rotation boolean not null default false;
create or replace function public.check_rocket_sponsorship_inventory()
returns trigger language plpgsql set search_path = '' as $$
declare v_slot text;
begin
  v_slot := (case when new.stripe_livemode then 'live:' else 'test:' end) ||
    (case when new.sponsorship_type = 'featured_app' then new.homepage_slot_id
      else 'category:' || new.target_category end);
  if v_slot is null then raise exception 'Sponsorship slot required' using errcode = '23514'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_slot)::bigint);
  if not new.shared_rotation and new.status in ('pending','scheduled','active') and exists (
    select 1 from public.rocket_sponsorships s
    where s.id <> new.id and not s.shared_rotation and s.stripe_livemode = new.stripe_livemode
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

create or replace function public.reserve_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text,
  p_livemode boolean, p_email text
) returns public.rocket_sponsorships
language plpgsql security invoker set search_path = '' as $$
declare v_slot text; v_start timestamptz; v_duration interval;
  v_homepage_slot text;
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
    select greatest(now(),coalesce(max(scheduled_end_at),now())) into v_start
      from public.rocket_sponsorships where slot_key=v_slot and not shared_rotation and status in ('pending','scheduled','active') and (status <> 'pending' or hold_expires_at > now());
  else
    if p_category is not null then raise exception 'Unexpected category'; end if;
    v_duration := interval '7 days';
    v_start := now();
    v_homepage_slot := 'homepage_featured_1'; -- Physical positions are assigned per page view.
  end if;
  insert into public.rocket_sponsorships(
    sponsorship_type,purchaser_user_id,purchaser_email,target_app_id,
    target_category,homepage_slot_id,stripe_livemode,amount_cents,shared_rotation,
    scheduled_start_at,scheduled_end_at,hold_expires_at
  ) values (
    p_type,p_user_id,p_email,p_app_id,p_category,v_homepage_slot,p_livemode,
    case when p_type='featured_app' then 4900 else 29900 end,true,
    v_start,v_start+v_duration,now()+interval '31 minutes'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.quote_rocket_sponsorship(
  p_user_id uuid, p_type text, p_app_id uuid, p_category text, p_livemode boolean
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_categories text[]; v_start timestamptz := now(); v_duration interval;
begin
  select a.categories into v_categories from public.public_discoverable_apps a
    join public.app_owners o on o.app_id=a.id and o.user_id=p_user_id
      and o.revoked_at is null where a.id=p_app_id;
  if not found then raise exception 'Eligible owned app required' using errcode='42501'; end if;
  if p_type='featured_app' and p_category is null then
    v_duration := interval '7 days';
  elsif p_type='category_sponsor' and p_category=any(v_categories) then
    v_duration := interval '30 days';
    -- Honor previously sold exclusive campaigns; new shared campaigns overlap each other.
    select greatest(now(),coalesce(max(scheduled_end_at),now())) into v_start
      from public.rocket_sponsorships
      where sponsorship_type='category_sponsor' and target_category=p_category
        and stripe_livemode=p_livemode and not shared_rotation
        and status in ('pending','scheduled','active')
        and (status <> 'pending' or hold_expires_at > now());
  else raise exception 'Invalid sponsorship target'; end if;
  return pg_catalog.jsonb_build_object('available',true,'shared_rotation',true,
    'start',v_start,'end',v_start+v_duration,'amount_cents',
    case when p_type='featured_app' then 4900 else 29900 end,
    'currency','usd','homepage_slot_id',case when p_type='featured_app' then 'homepage_featured_1' end);
end;
$$;

-- Bounded, public-safe response: all eligible paid campaigns participate in the
-- random draw, including pools larger than PostgREST's row limit. Legacy paid
-- homepage positions retain their original positions until their campaigns end.
create function public.rocket_rotating_ad_placements(p_category text default null)
returns jsonb language sql volatile security invoker set search_path = '' as $$
with eligible as materialized (
  select s.*, a.name, a.slug, a.tagline, a.logo_url
  from public.active_rocket_sponsorships(p_category) active
  join public.rocket_sponsorships s on s.id=active.sponsorship_id
  join public.public_discoverable_apps a on a.id=s.target_app_id
), legacy as (
  select * from eligible where sponsorship_type='featured_app' and not shared_rotation
), free_slots as (
  select 'homepage_featured_'||n as slot, row_number() over(order by n) as position
  from pg_catalog.generate_series(1,8) n
  where not exists(select 1 from legacy l where l.homepage_slot_id='homepage_featured_'||n)
), drawn as materialized (
  select * from eligible where sponsorship_type='featured_app' and shared_rotation
  order by random() limit (select count(*) from free_slots)
), numbered as (
  select d.*, row_number() over() as position from drawn d
), selected as (
  select l.id, l.homepage_slot_id as slot from legacy l
  union all
  select d.id, f.slot from numbered d join free_slots f using(position)
  union all
  (select e.id, null::text from eligible e
    where e.sponsorship_type='category_sponsor' and e.target_category=p_category
    order by e.shared_rotation, random() limit 1)
), placements as (
  select jsonb_build_object('sponsorship_id',e.id,'sponsorship_type',e.sponsorship_type,
    'app_id',e.target_app_id,'category',e.target_category,'starts_at',e.actual_start_at,
    'ends_at',e.actual_end_at,'homepage_slot_id',s.slot,'destination_url',e.destination_url,
    'app',jsonb_build_object('id',e.target_app_id,'name',e.name,'slug',e.slug,
      'tagline',e.tagline,'logo_url',e.logo_url)) as placement, s.slot
  from selected s join eligible e on e.id=s.id
)
select jsonb_build_object('placements',coalesce(jsonb_agg(placement order by slot),'[]'::jsonb),
  'occupied_homepage_slots',coalesce(jsonb_agg(slot order by slot) filter(where slot is not null),'[]'::jsonb))
from placements;
$$;
revoke all on function public.rocket_rotating_ad_placements(text) from public,anon,authenticated;
grant execute on function public.rocket_rotating_ad_placements(text) to service_role;
notify pgrst, 'reload schema';
