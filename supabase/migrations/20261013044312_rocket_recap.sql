-- Monthly Rocket-native activity only. No provider, billing, or ranking data enters this schema.
create table public.rocket_recaps (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  apps jsonb not null,
  totals jsonb not null,
  coverage jsonb not null,
  calculation_version integer not null default 1,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start),
  check (extract(day from month_start) = 1)
);
alter table public.rocket_recaps enable row level security;
revoke all on public.rocket_recaps from public, anon, authenticated;
grant all on public.rocket_recaps to service_role;

create table public.rocket_recap_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  app_id uuid references app_graph.apps(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (user_id, month_start) references public.rocket_recaps(user_id, month_start) on delete cascade
);
create index rocket_recap_shares_owner_idx on public.rocket_recap_shares(user_id, month_start desc);
alter table public.rocket_recap_shares enable row level security;
revoke all on public.rocket_recap_shares from public, anon, authenticated;
grant all on public.rocket_recap_shares to service_role;

-- A cron-only, idempotent projection. The event log's first reliable month is
-- October 2026 for profile views and November 2026 for full-month clicks.
create function public.generate_rocket_recaps(p_month date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_end date;
  v_owner record;
  v_apps jsonb;
  v_views bigint;
  v_clicks bigint;
  v_count integer := 0;
  v_month_label text;
begin
  if (select auth.role()) <> 'service_role' and current_user <> 'postgres' then
    raise exception 'service role required';
  end if;
  if p_month is null or extract(day from p_month) <> 1 or
     p_month < date '2026-10-01' or
     p_month >= date_trunc('month', now() at time zone 'utc')::date then
    raise exception 'a supported completed UTC month is required';
  end if;
  v_end := (p_month + interval '1 month')::date;
  v_month_label := to_char(p_month, 'FMMonth YYYY');
  for v_owner in
    select distinct o.user_id
    from public.app_owners o
    join app_graph.apps a on a.id = o.app_id
    join auth.users u on u.id = o.user_id
    where o.revoked_at is null and o.verification_level = 'domain_verified'
      and a.is_public and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data->>'rocket_test_account', 'false') <> 'true'
      and exists (select 1 from app_graph.app_sources s where s.app_id = a.id and s.status = 'active')
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'slug', q.slug, 'name', q.name, 'logo_url', q.logo_url,
      'views', q.views, 'clicks', q.clicks
    ) order by q.views desc, q.name), '[]'::jsonb),
    coalesce(sum(q.views), 0), coalesce(sum(q.clicks), 0)
    into v_apps, v_views, v_clicks
    from (
      select a.id, a.slug, a.name, a.logo_url,
        (select count(*) from app_graph.app_profile_view_events e
          where e.app_id = a.id and e.view_day >= p_month and e.view_day < v_end)::bigint as views,
        (select count(*) from app_graph.marketplace_clicks c
          where c.app_id = a.id and c.click_day >= p_month and c.click_day < v_end)::bigint as clicks
      from public.app_owners o join app_graph.apps a on a.id = o.app_id
      where o.user_id = v_owner.user_id and o.revoked_at is null
        and o.verification_level = 'domain_verified' and a.is_public
        and exists (select 1 from app_graph.app_sources s where s.app_id = a.id and s.status = 'active')
    ) q;
    if v_views + v_clicks = 0 then continue; end if;
    insert into public.rocket_recaps(user_id, month_start, apps, totals, coverage)
    values (v_owner.user_id, p_month, v_apps,
      jsonb_build_object('views', v_views, 'clicks', v_clicks, 'app_count', jsonb_array_length(v_apps)),
      jsonb_build_object('views', case when p_month >= date '2026-10-01' then 'complete' else 'unavailable' end,
                         'clicks', case when p_month >= date '2026-11-01' then 'complete' else 'partial' end))
    on conflict (user_id, month_start) do update set
      apps = excluded.apps, totals = excluded.totals, coverage = excluded.coverage,
      calculation_version = excluded.calculation_version, updated_at = now();
    insert into public.account_notifications(user_id, kind, title, body, href, event_key)
    values (v_owner.user_id, 'app', 'Your ' || v_month_label || ' Rocket Recap is ready',
      'See how people explored your apps on Rocket.', '/recap',
      'rocket-recap:' || to_char(p_month, 'YYYY-MM'))
    on conflict (user_id, event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.generate_rocket_recaps(date) from public, anon, authenticated;
grant execute on function public.generate_rocket_recaps(date) to service_role;

create function public.my_rocket_recaps() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'recaps', coalesce((select jsonb_agg(jsonb_build_object(
      'month', r.month_start, 'apps', r.apps, 'totals', r.totals,
      'coverage', r.coverage, 'updated_at', r.updated_at
    ) order by r.month_start desc) from public.rocket_recaps r where r.user_id = (select auth.uid())), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'month', s.month_start, 'app_id', s.app_id, 'snapshot', s.snapshot
    ) order by s.created_at desc) from public.rocket_recap_shares s
      where s.user_id = (select auth.uid()) and s.revoked_at is null), '[]'::jsonb)
  );
$$;
revoke all on function public.my_rocket_recaps() from public, anon;
grant execute on function public.my_rocket_recaps() to authenticated;

create function public.create_rocket_recap_share(p_month date, p_app_id uuid, p_metrics text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_recap public.rocket_recaps%rowtype;
  v_app jsonb; v_metrics jsonb := '{}'::jsonb; v_key text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_recap from public.rocket_recaps
    where user_id = v_user and month_start = p_month;
  if not found then raise exception 'recap unavailable'; end if;
  if p_app_id is not null then
    select value into v_app from jsonb_array_elements(v_recap.apps)
      where value->>'id' = p_app_id::text limit 1;
    if v_app is null then raise exception 'app unavailable'; end if;
  end if;
  if not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
    where o.user_id=v_user and o.revoked_at is null and o.verification_level='domain_verified'
      and a.is_public and (p_app_id is null or a.id=p_app_id)) then
    raise exception 'ownership unavailable';
  end if;
  if not exists (select 1 from public.member_public_profiles p where p.user_id=v_user) then
    raise exception 'publish a public profile before sharing';
  end if;
  if exists (select 1 from jsonb_array_elements(v_recap.apps) item
    where (p_app_id is null or item->>'id'=p_app_id::text)
      and not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
        where o.app_id=(item->>'id')::uuid and o.user_id=v_user and o.revoked_at is null
          and o.verification_level='domain_verified' and a.is_public)) then
    raise exception 'an app is no longer eligible';
  end if;
  if p_metrics is null or cardinality(p_metrics) = 0 or cardinality(p_metrics) > 2 then
    raise exception 'select one or two metrics';
  end if;
  foreach v_key in array p_metrics loop
    if v_key not in ('views','clicks') or v_metrics ? v_key then raise exception 'invalid metric'; end if;
    if (case when p_app_id is null then v_recap.totals else v_app end ->> v_key)::bigint <= 0 then
      raise exception 'metric unavailable';
    end if;
    v_metrics := v_metrics || jsonb_build_object(v_key,
      (case when p_app_id is null then v_recap.totals else v_app end ->> v_key)::bigint);
  end loop;
  insert into public.rocket_recap_shares(user_id,month_start,app_id,snapshot)
    values (v_user,p_month,p_app_id,jsonb_build_object(
      'month',p_month,'app',case when p_app_id is null then null else
        jsonb_build_object('id',p_app_id,'slug',v_app->>'slug','name',v_app->>'name','logo_url',v_app->>'logo_url') end,
      'metrics',v_metrics,'coverage',v_recap.coverage,
      'app_ids',case when p_app_id is null then
        (select coalesce(jsonb_agg(item->>'id'),'[]'::jsonb) from jsonb_array_elements(v_recap.apps) item)
        else jsonb_build_array(p_app_id::text) end)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_rocket_recap_share(date,uuid,text[]) from public, anon;
grant execute on function public.create_rocket_recap_share(date,uuid,text[]) to authenticated;

create function public.revoke_rocket_recap_share(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.rocket_recap_shares set revoked_at=now()
    where id=p_id and user_id=(select auth.uid()) and revoked_at is null;
  return found;
end;
$$;
revoke all on function public.revoke_rocket_recap_share(uuid) from public, anon;
grant execute on function public.revoke_rocket_recap_share(uuid) to authenticated;

-- This is the sole public projection. An unguessable token is necessary but
-- insufficient: current owner verification and public app status are rechecked.
create function public.get_public_rocket_recap(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',s.id,'snapshot',s.snapshot,'username',p.username,
    'avatar_url',p.avatar_url,'profile_url','/@' || p.username)
  from public.rocket_recap_shares s
  join public.member_public_profiles p on p.user_id=s.user_id
  where s.id=p_id and s.revoked_at is null
    and not exists (select 1 from jsonb_array_elements_text(s.snapshot->'app_ids') app_id
      where not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
        where o.app_id=app_id::uuid and o.user_id=s.user_id and o.revoked_at is null
          and o.verification_level='domain_verified' and a.is_public));
$$;
revoke all on function public.get_public_rocket_recap(uuid) from public;
grant execute on function public.get_public_rocket_recap(uuid) to anon, authenticated;

-- Day two of each month, UTC. No email is sent by this job.
select cron.schedule('rocket-recap-monthly', '0 3 2 * *',
  $$select public.generate_rocket_recaps((date_trunc('month', now() at time zone 'utc') - interval '1 month')::date)$$);
