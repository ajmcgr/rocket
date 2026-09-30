-- Public identity hygiene is distinct from indexing and from editorial endorsement.
-- Website failures only de-emphasize after repeated hard failures on separate days.
create table app_graph.app_website_health (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  checked_at timestamptz not null,
  last_success_at timestamptz,
  consecutive_hard_failures integer not null default 0 check (consecutive_hard_failures >= 0),
  status text not null check (status in ('working', 'uncertain', 'persistently_unavailable'))
);
alter table app_graph.app_website_health enable row level security;
grant select on app_graph.app_website_health to anon, authenticated;
grant all on app_graph.app_website_health to service_role;
create policy "Public app website health" on app_graph.app_website_health
  for select to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );

create view public.public_discoverable_apps with (security_invoker = true) as
select a.* from public.public_apps a
left join app_graph.app_website_health h on h.app_id = a.id
where length(btrim(a.name)) >= 3
  and greatest(length(btrim(coalesce(a.tagline, ''))), length(btrim(coalesce(a.description, '')))) >= 24
  and cardinality(a.categories) > 0
  and a.website_url ~* '^https?://[^/]+\.[^/]+'
  and (h.status is distinct from 'persistently_unavailable'
    or h.checked_at < now() - interval '14 days');
revoke all on public.public_discoverable_apps from public;
grant select on public.public_discoverable_apps to anon, authenticated;

create or replace view public.public_app_categories with (security_invoker = true) as
select category, count(*)::integer as app_count
from public.public_discoverable_apps a cross join lateral unnest(a.categories) category
group by category;

create view public.public_discoverable_app_intelligence with (security_invoker = true) as
select i.* from public.public_app_intelligence i
join public.public_discoverable_apps a on a.id = i.app_id;
revoke all on public.public_discoverable_app_intelligence from public;
grant select on public.public_discoverable_app_intelligence to anon, authenticated;

create function public.next_app_website_checks(p_limit integer)
returns table(app_id uuid, website_url text)
language sql security invoker set search_path = '' as $$
  select a.id, a.website_url from app_graph.apps a
  left join app_graph.app_website_health h on h.app_id = a.id
  where a.is_public and p_limit between 1 and 100
  order by case when h.consecutive_hard_failures between 1 and 2
      and h.checked_at < now() - interval '12 hours' then 0 else 1 end,
    h.checked_at asc nulls first, a.id
  limit p_limit;
$$;
revoke all on function public.next_app_website_checks(integer) from public, anon, authenticated;
grant execute on function public.next_app_website_checks(integer) to service_role;

create function public.record_app_website_check(p_app_id uuid, p_result text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_previous app_graph.app_website_health%rowtype; v_failures integer;
begin
  if p_result not in ('working', 'hard_failure', 'uncertain') then
    raise exception 'Invalid website check result';
  end if;
  if not exists (select 1 from app_graph.apps where id = p_app_id and is_public) then
    raise exception 'Unknown public app';
  end if;
  select * into v_previous from app_graph.app_website_health where app_id = p_app_id for update;
  v_failures := case when p_result = 'working' then 0
    when p_result = 'hard_failure' and (v_previous.checked_at is null or v_previous.checked_at < now() - interval '12 hours')
      then coalesce(v_previous.consecutive_hard_failures, 0) + 1
    else coalesce(v_previous.consecutive_hard_failures, 0) end;
  insert into app_graph.app_website_health(app_id, checked_at, last_success_at, consecutive_hard_failures, status)
  values (p_app_id, now(), case when p_result = 'working' then now() else v_previous.last_success_at end,
    v_failures, case when p_result = 'working' then 'working'
      when v_failures >= 3 and (p_result = 'hard_failure' or v_previous.status = 'persistently_unavailable')
        then 'persistently_unavailable'
      else 'uncertain' end)
  on conflict (app_id) do update set checked_at = excluded.checked_at,
    last_success_at = excluded.last_success_at,
    consecutive_hard_failures = excluded.consecutive_hard_failures,
    status = excluded.status;
end;
$$;
revoke all on function public.record_app_website_check(uuid,text) from public, anon, authenticated;
grant execute on function public.record_app_website_check(uuid,text) to service_role;
