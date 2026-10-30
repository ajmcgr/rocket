-- A private, durable ledger for the Rocket-owned X account. A reservation is
-- never automatically retried: the X request may have succeeded before a
-- network failure made its response unavailable.
create table public.rocket_x_app_posts (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  reserved_day date not null default ((now() at time zone 'UTC')::date) unique,
  status text not null default 'reserved' check (status in ('reserved', 'posted')),
  x_post_id text unique,
  post_text text,
  posted_at timestamptz,
  check ((status = 'reserved' and x_post_id is null and posted_at is null)
    or (status = 'posted' and x_post_id is not null and posted_at is not null))
);
alter table public.rocket_x_app_posts enable row level security;
revoke all on public.rocket_x_app_posts from public, anon, authenticated;
grant select, insert, update on public.rocket_x_app_posts to service_role;

-- Starting at migration deployment avoids posting a backlog of older apps.
create table public.rocket_x_posting_control (
  id boolean primary key default true check (id),
  start_at timestamptz not null default now()
);
insert into public.rocket_x_posting_control (id) values (true);
alter table public.rocket_x_posting_control enable row level security;
revoke all on public.rocket_x_posting_control from public, anon, authenticated;
grant select on public.rocket_x_posting_control to service_role;

grant select on public.public_apps, public.public_discoverable_apps to service_role;

create function public.rocket_x_reserve_next_app()
returns table(app_id uuid, slug text, name text, tagline text)
language plpgsql security invoker set search_path = '' as $$
declare v_app_id uuid;
begin
  insert into public.rocket_x_app_posts (app_id)
  select d.app_id
  from public.app_submission_details d
  join public.app_owners o on o.app_id = d.app_id and o.revoked_at is null
  join public.public_discoverable_apps p on p.id = d.app_id
  join app_graph.apps a on a.id = d.app_id
  cross join public.rocket_x_posting_control c
  where c.id and d.created_at >= c.start_at
    and d.created_at < now() - interval '1 hour'
    and a.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and not exists (select 1 from public.rocket_x_app_posts sent where sent.app_id = d.app_id)
  order by d.created_at, d.app_id
  limit 1
  on conflict do nothing
  returning rocket_x_app_posts.app_id into v_app_id;

  if v_app_id is null then return; end if;
  return query
    select a.id, a.slug, p.name, coalesce(nullif(p.tagline, ''), p.description)
    from app_graph.apps a
    join public.public_discoverable_apps p on p.id = a.id
    where a.id = v_app_id;
end;
$$;
revoke all on function public.rocket_x_reserve_next_app() from public, anon, authenticated;
grant execute on function public.rocket_x_reserve_next_app() to service_role;
