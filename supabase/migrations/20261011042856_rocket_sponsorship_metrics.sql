-- First-party, daily-deduplicated performance for Rocket-owned paid placements.
-- No raw IP address, user agent, or identity is retained.
create table public.rocket_sponsorship_metrics (
  sponsorship_id uuid not null references public.rocket_sponsorships(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'click')),
  event_day date not null default (now() at time zone 'utc')::date,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default now(),
  primary key (sponsorship_id, event_type, event_day, visitor_hash)
);
alter table public.rocket_sponsorship_metrics enable row level security;
revoke all on public.rocket_sponsorship_metrics from public, anon, authenticated;
grant select, insert on public.rocket_sponsorship_metrics to service_role;

-- The service-only recorder checks the same live, paid, in-window inventory
-- rule used to render the placement. Retries from a visitor on one UTC day
-- cannot increase the count.
create function public.record_rocket_sponsorship_metric(
  p_sponsorship_id uuid, p_app_id uuid, p_event_type text, p_visitor_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_event_type not in ('view', 'click')
    or p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.active_rocket_sponsorships(null) a
      where a.sponsorship_id = p_sponsorship_id and a.app_id = p_app_id
    ) then
    return false;
  end if;

  insert into public.rocket_sponsorship_metrics(sponsorship_id, event_type, visitor_hash)
    values (p_sponsorship_id, p_event_type, p_visitor_hash)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.record_rocket_sponsorship_metric(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.record_rocket_sponsorship_metric(uuid,uuid,text,text)
  to service_role;

-- The authenticated Edge Function passes the verified buyer ID; the service
-- role is the sole caller and can only return that buyer's live bookings.
create function public.rocket_sponsorship_metrics_for_owner(p_user_id uuid)
returns table(sponsorship_id uuid, views bigint, clicks bigint)
language sql stable security invoker set search_path = '' as $$
  select s.id,
    count(m.sponsorship_id) filter (where m.event_type = 'view'),
    count(m.sponsorship_id) filter (where m.event_type = 'click')
  from public.rocket_sponsorships s
  left join public.rocket_sponsorship_metrics m on m.sponsorship_id = s.id
  where s.purchaser_user_id = p_user_id and s.stripe_livemode
  group by s.id;
$$;
revoke all on function public.rocket_sponsorship_metrics_for_owner(uuid)
  from public, anon, authenticated;
grant execute on function public.rocket_sponsorship_metrics_for_owner(uuid)
  to service_role;
