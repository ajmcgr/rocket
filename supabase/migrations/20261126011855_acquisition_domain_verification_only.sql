-- Domain verification is the publication gate for acquisition listings.
-- Keep the existing ownership, public-app, input, and seller-takeover checks.
create or replace function public.set_rocket_acquisition_listing(
  p_app_id uuid, p_status text, p_asking_price_cents bigint default null,
  p_description text default '', p_reason text default '', p_preferred_buyer text default ''
) returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_previous public.rocket_acquisition_listings; v_review text;
begin
  if v_user is null or p_status not in ('not_for_sale','open_to_offers','for_sale')
    or p_asking_price_cents is not null and (p_asking_price_cents < 100 or p_asking_price_cents > 100000000000)
    or (p_status <> 'for_sale' and p_asking_price_cents is not null)
    or length(coalesce(p_description,'')) > 1000 or length(coalesce(p_reason,'')) > 500
    or length(coalesce(p_preferred_buyer,'')) > 500 then
    raise exception 'Invalid acquisition listing' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
    where o.app_id=p_app_id and o.user_id=v_user and o.revoked_at is null
      and o.verification_level='domain_verified' and a.is_public) then
    raise exception 'Domain-verified app ownership required' using errcode='42501';
  end if;
  select * into v_previous from public.rocket_acquisition_listings where app_id=p_app_id for update;
  if v_previous.app_id is not null and v_previous.seller_user_id <> v_user and exists (
    select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=v_previous.seller_user_id
      and o.verification_level='domain_verified' and o.revoked_at is null) then
    raise exception 'Listing belongs to another seller' using errcode='42501';
  end if;
  v_review := case when p_status='not_for_sale' then 'pending' else 'approved' end;
  insert into public.rocket_acquisition_listings(app_id,seller_user_id,status,review_status,asking_price_cents,
    description,reason_for_selling,preferred_buyer,approved_at)
  values(p_app_id,v_user,p_status,v_review,p_asking_price_cents,coalesce(p_description,''),
    coalesce(p_reason,''),coalesce(p_preferred_buyer,''),
    case when v_review='approved' then now() else null end)
    on conflict(app_id) do update set seller_user_id=excluded.seller_user_id,status=excluded.status,review_status=excluded.review_status,
    asking_price_cents=excluded.asking_price_cents,description=excluded.description,
    reason_for_selling=excluded.reason_for_selling,preferred_buyer=excluded.preferred_buyer,
    approved_at=case when excluded.review_status='approved'
      then coalesce(rocket_acquisition_listings.approved_at,excluded.approved_at) else null end,
    updated_at=now();
  return v_review;
end $$;
revoke all on function public.set_rocket_acquisition_listing(uuid,text,bigint,text,text,text) from public,anon;
grant execute on function public.set_rocket_acquisition_listing(uuid,text,bigint,text,text,text) to authenticated;

-- Private, owner-scoped seller drafts. Anonymous visitors prepare drafts in their browser.
create table public.rocket_sell_listing_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 16384),
  updated_at timestamptz not null default now()
);
alter table public.rocket_sell_listing_drafts enable row level security;
revoke all on public.rocket_sell_listing_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.rocket_sell_listing_drafts to authenticated;
create policy rocket_sell_draft_owner on public.rocket_sell_listing_drafts
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create function public.set_rocket_sell_draft_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger rocket_sell_draft_updated_at before insert or update on public.rocket_sell_listing_drafts
for each row execute function public.set_rocket_sell_draft_updated_at();

alter table app_graph.valuation_funnel_events drop constraint valuation_funnel_events_event_kind_check;
alter table app_graph.valuation_funnel_events add constraint valuation_funnel_events_event_kind_check
  check (event_kind in ('valuation_page_viewed','valuation_started','valuation_completed','valuation_signup_started',
    'valuation_signup_completed','valuation_draft_restored','valuation_app_submitted','valuation_ownership_verified',
    'valuation_app_selected','valuation_stripe_connected','valuation_ga4_connected','valuation_saved',
    'valuation_shared','valuation_listing_started','valuation_listing_published'));

create or replace function public.record_rocket_valuation_event(p_event_id uuid, p_session_id uuid,
  p_visitor_hash text, p_event_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Access denied'; end if;
  if p_event_kind not in ('valuation_page_viewed','valuation_started','valuation_completed','valuation_signup_started',
    'valuation_signup_completed','valuation_draft_restored','valuation_app_submitted','valuation_ownership_verified',
    'valuation_app_selected','valuation_stripe_connected','valuation_ga4_connected','valuation_saved',
    'valuation_shared','valuation_listing_started','valuation_listing_published')
    or p_visitor_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_visitor_hash, 0));
  if (select count(*) from app_graph.valuation_funnel_events
      where visitor_hash = p_visitor_hash and created_at >= now() - interval '1 day') >= 100 then return false; end if;
  insert into app_graph.valuation_funnel_events(event_id,session_id,visitor_hash,event_kind)
    values(p_event_id,p_session_id,p_visitor_hash,p_event_kind) on conflict (event_id) do nothing;
  return true;
end;
$$;
revoke all on function public.record_rocket_valuation_event(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_rocket_valuation_event(uuid,uuid,text,text) to service_role;
