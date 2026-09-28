-- Rocket's public app catalogue is isolated from creative projects and Connect billing.
create extension if not exists pg_trgm with schema extensions;
create schema if not exists app_graph;

create table app_graph.apps (
  id uuid primary key default gen_random_uuid(),
  seed_source_type text not null default 'launch',
  seed_source_external_id text not null,
  name text not null check (length(name) between 1 and 240),
  tagline text,
  description text,
  website_url text not null,
  canonical_host text not null,
  logo_url text,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  launched_at timestamptz,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_public boolean not null default true,
  source_hash text not null,
  unique (seed_source_type, seed_source_external_id)
);

create table app_graph.app_sources (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references app_graph.apps(id) on delete set null,
  source_type text not null,
  external_id text not null,
  source_url text not null,
  website_url text,
  source_hash text not null,
  match_state text not null check (match_state in ('attached', 'ambiguous')),
  status text not null default 'active' check (status in ('active', 'withdrawn')),
  public_evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_run_id uuid,
  unique (source_type, external_id),
  check ((match_state = 'attached' and app_id is not null) or (match_state = 'ambiguous' and app_id is null))
);

create table app_graph.app_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  expected_count integer not null check (expected_count >= 0),
  received_count integer not null default 0,
  imported_count integer not null default 0,
  ambiguous_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);

create table app_graph.app_identity_events (
  id bigint generated always as identity primary key,
  app_id uuid,
  source_id uuid,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index apps_public_launch_idx on app_graph.apps (launched_at desc nulls last, id) where is_public;
create index apps_public_recent_idx on app_graph.apps (discovered_at desc, id) where is_public;
create index apps_public_categories_idx on app_graph.apps using gin (categories) where is_public;
create index apps_public_platforms_idx on app_graph.apps using gin (platforms) where is_public;
create index apps_public_name_search_idx on app_graph.apps using gin (name extensions.gin_trgm_ops) where is_public;
create index apps_public_tagline_search_idx on app_graph.apps using gin (tagline extensions.gin_trgm_ops) where is_public;
create index apps_public_description_search_idx on app_graph.apps using gin (description extensions.gin_trgm_ops) where is_public;
create index app_sources_app_idx on app_graph.app_sources (app_id, source_type) where status = 'active';
create index app_sources_run_idx on app_graph.app_sources (source_type, last_seen_run_id);

alter table app_graph.apps enable row level security;
alter table app_graph.app_sources enable row level security;
alter table app_graph.app_import_jobs enable row level security;
alter table app_graph.app_identity_events enable row level security;

-- The private schema is not in PostgREST's exposed schema list. These narrow
-- grants let security-invoker public views apply RLS without exposing raw tables.
grant usage on schema app_graph to anon, authenticated, service_role;
grant select on app_graph.apps, app_graph.app_sources to anon, authenticated;
grant all on all tables in schema app_graph to service_role;
grant usage, select on all sequences in schema app_graph to service_role;

create policy "Public catalogue apps" on app_graph.apps
  for select to anon, authenticated using (is_public);
create policy "Sources of public apps" on app_graph.app_sources
  for select to anon, authenticated using (
    status = 'active' and match_state = 'attached' and
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );

create view public.public_apps with (security_invoker = true) as
select a.id, a.name, a.tagline, a.description, a.website_url,
  a.canonical_host, a.logo_url, a.categories, a.tags, a.platforms,
  a.launched_at, a.discovered_at,
  s.source_url as launch_url,
  'unclaimed'::text as claim_state
from app_graph.apps a
left join app_graph.app_sources s on s.app_id = a.id
  and s.source_type = 'launch' and s.status = 'active' and s.match_state = 'attached'
where a.is_public;

create view public.public_app_sources with (security_invoker = true) as
select s.app_id, s.source_type, s.source_url, s.first_seen_at, s.last_seen_at
from app_graph.app_sources s
join app_graph.apps a on a.id = s.app_id
where a.is_public and s.status = 'active' and s.match_state = 'attached';

create view public.public_app_categories with (security_invoker = true) as
select category, count(*)::integer as app_count
from app_graph.apps a cross join lateral unnest(a.categories) category
where a.is_public
group by category;

revoke all on public.public_apps, public.public_app_sources, public.public_app_categories from public;
grant select on public.public_apps, public.public_app_sources, public.public_app_categories to anon, authenticated;

-- Only a service-role caller may start or complete a Launch ingestion run.
create function public.start_launch_app_import(p_expected_count integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if p_expected_count < 0 then raise exception 'Invalid expected count'; end if;
  insert into app_graph.app_import_jobs(source_type, status, expected_count)
  values ('launch', 'running', p_expected_count) returning id into v_id;
  return v_id;
end;
$$;

create function public.sync_launch_app_batch(p_run_id uuid, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v_source_id uuid;
  v_app_id uuid;
  v_existing_hash text;
  v_source_url text;
  v_external_id text;
  v_ambiguous boolean;
  v_imported integer := 0;
  v_ambiguous_count integer := 0;
  v_job app_graph.app_import_jobs%rowtype;
begin
  select * into v_job from app_graph.app_import_jobs where id = p_run_id for update;
  if not found or v_job.status <> 'running' then raise exception 'Import run is not active'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Batch must contain at most 100 records';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_external_id := v_item->>'launch_id';
    v_source_url := v_item->>'source_url';
    v_ambiguous := coalesce((v_item->>'ambiguous')::boolean, false);
    if v_external_id is null or v_source_url !~ '^https://trylaunch[.]ai/launch/'
      or (v_item->>'website_url') !~ '^https?://'
      or length(coalesce(v_item->>'name','')) not between 1 and 240 then
      raise exception 'Invalid public Launch record';
    end if;

    select id, app_id, source_hash into v_source_id, v_app_id, v_existing_hash
    from app_graph.app_sources where source_type = 'launch' and external_id = v_external_id
    for update;

    if v_source_id is null then
      if not v_ambiguous then
        insert into app_graph.apps (
          seed_source_external_id, name, tagline, description, website_url,
          canonical_host, logo_url, categories, tags, platforms, launched_at, source_hash
        ) values (
          v_external_id, v_item->>'name', v_item->>'tagline', v_item->>'description',
          v_item->>'website_url', v_item->>'canonical_host', v_item->>'logo_url',
          array(select jsonb_array_elements_text(coalesce(v_item->'categories','[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(v_item->'tags','[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(v_item->'platforms','[]'::jsonb))),
          (v_item->>'launched_at')::timestamptz, v_item->>'source_hash'
        ) returning id into v_app_id;
        v_imported := v_imported + 1;
      else
        v_ambiguous_count := v_ambiguous_count + 1;
      end if;

      insert into app_graph.app_sources (
        app_id, source_type, external_id, source_url, website_url,
        source_hash, match_state, public_evidence, last_seen_run_id
      ) values (
        v_app_id, 'launch', v_external_id, v_source_url, v_item->>'website_url',
        v_item->>'source_hash', case when v_app_id is null then 'ambiguous' else 'attached' end,
        jsonb_build_object('launch_date', v_item->>'launched_at', 'category_count',
          jsonb_array_length(coalesce(v_item->'categories','[]'::jsonb))), p_run_id
      ) returning id into v_source_id;
      insert into app_graph.app_identity_events(app_id, source_id, event_type)
      values (v_app_id, v_source_id, case when v_app_id is null then 'launch_ambiguous' else 'launch_imported' end);
    else
      update app_graph.app_sources set
        source_url = v_source_url, website_url = v_item->>'website_url',
        source_hash = v_item->>'source_hash', status = 'active',
        last_seen_at = now(), last_seen_run_id = p_run_id
      where id = v_source_id;

      -- Once reviewed or attached, a later automated run never changes identity.
      if v_app_id is not null and v_existing_hash is distinct from (v_item->>'source_hash') then
        update app_graph.apps set name = v_item->>'name', tagline = v_item->>'tagline',
          description = v_item->>'description', website_url = v_item->>'website_url',
          canonical_host = v_item->>'canonical_host', logo_url = v_item->>'logo_url',
          categories = array(select jsonb_array_elements_text(coalesce(v_item->'categories','[]'::jsonb))),
          tags = array(select jsonb_array_elements_text(coalesce(v_item->'tags','[]'::jsonb))),
          platforms = array(select jsonb_array_elements_text(coalesce(v_item->'platforms','[]'::jsonb))),
          launched_at = (v_item->>'launched_at')::timestamptz,
          source_hash = v_item->>'source_hash', updated_at = now(), is_public = true
        where id = v_app_id and seed_source_type = 'launch'
          and seed_source_external_id = v_external_id;
      elsif v_app_id is not null then
        update app_graph.apps set is_public = true, updated_at = now()
        where id = v_app_id and not is_public;
      end if;
    end if;
  end loop;

  update app_graph.app_import_jobs set
    received_count = received_count + jsonb_array_length(p_items),
    imported_count = imported_count + v_imported,
    ambiguous_count = ambiguous_count + v_ambiguous_count
  where id = p_run_id;
  return jsonb_build_object('received', jsonb_array_length(p_items), 'imported', v_imported,
    'ambiguous', v_ambiguous_count);
end;
$$;

create function public.finish_launch_app_import(p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_job app_graph.app_import_jobs%rowtype; v_seen integer; v_withdrawn integer;
begin
  select * into v_job from app_graph.app_import_jobs where id = p_run_id for update;
  if not found or v_job.status <> 'running' then raise exception 'Import run is not active'; end if;
  select count(*) into v_seen from app_graph.app_sources
    where source_type = 'launch' and last_seen_run_id = p_run_id;
  if v_seen <> v_job.expected_count then
    raise exception 'Incomplete Launch import: saw %, expected %', v_seen, v_job.expected_count;
  end if;
  update app_graph.app_sources set status = 'withdrawn'
    where source_type = 'launch' and status = 'active'
      and last_seen_run_id is distinct from p_run_id;
  get diagnostics v_withdrawn = row_count;
  update app_graph.apps a set is_public = false, updated_at = now()
    where a.seed_source_type = 'launch' and a.is_public
      and not exists (select 1 from app_graph.app_sources s where s.app_id = a.id and s.status = 'active');
  update app_graph.app_import_jobs set status = 'completed', finished_at = now()
    where id = p_run_id;
  return jsonb_build_object('seen', v_seen, 'withdrawn_sources', v_withdrawn);
end;
$$;

revoke all on function public.start_launch_app_import(integer) from public, anon, authenticated;
revoke all on function public.sync_launch_app_batch(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finish_launch_app_import(uuid) from public, anon, authenticated;
grant execute on function public.start_launch_app_import(integer) to service_role;
grant execute on function public.sync_launch_app_batch(uuid, jsonb) to service_role;
grant execute on function public.finish_launch_app_import(uuid) to service_role;
