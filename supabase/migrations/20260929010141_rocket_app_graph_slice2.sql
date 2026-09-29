-- Slice 2 extends the Slice 1 graph without changing existing app identities.
alter table app_graph.apps
  add column claim_state text not null default 'unclaimed'
    check (claim_state in ('unclaimed', 'claimed', 'domain_verified')),
  add column owner_curated_at timestamptz;

alter table app_graph.app_sources add column normalized_source_url text;
update app_graph.app_sources set normalized_source_url = source_url
  where source_type = 'launch' and normalized_source_url is null;
create unique index app_sources_normalized_url_idx
  on app_graph.app_sources (normalized_source_url)
  where normalized_source_url is not null and status = 'active';
create index apps_canonical_host_idx on app_graph.apps (canonical_host);
create index apps_website_url_idx on app_graph.apps (website_url);

create table public.app_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submitted_url text not null,
  normalized_url text not null,
  source_type text not null,
  status text not null default 'queued' check
    (status in ('queued','fetching','extracting','resolving','complete','needs_review','failed')),
  result jsonb not null default '{}'::jsonb,
  error text,
  app_id uuid references app_graph.apps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);
create index app_jobs_user_recent_idx on public.app_jobs (user_id, created_at desc);

create table public.app_claims (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('dns_txt','https_well_known','manual_review','existing_relationship')),
  status text not null default 'pending' check
    (status in ('pending','review','verified','rejected','revoked')),
  verification_state text not null default 'unverified' check
    (verification_state in ('unverified','credible','domain_verified')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  review_reason text,
  unique (app_id, user_id, method)
);
create index app_claims_user_idx on public.app_claims (user_id, created_at desc);
create index app_claims_app_idx on public.app_claims (app_id, status);

create table public.app_owners (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_id uuid not null unique references public.app_claims(id),
  verification_level text not null check (verification_level in ('claimed','domain_verified')),
  verified_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index app_owners_user_idx on public.app_owners (user_id) where revoked_at is null;

create table public.app_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.app_claims(id) on delete cascade,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('dns_txt','https_well_known')),
  hostname text not null,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending','verified','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index app_challenges_claim_idx on public.app_verification_challenges (claim_id, status);

alter table public.app_jobs enable row level security;
alter table public.app_claims enable row level security;
alter table public.app_owners enable row level security;
alter table public.app_verification_challenges enable row level security;
revoke all on public.app_jobs, public.app_claims, public.app_owners,
  public.app_verification_challenges from public, anon, authenticated;
grant select on public.app_jobs, public.app_claims, public.app_owners to authenticated;
grant all on public.app_jobs, public.app_claims, public.app_owners,
  public.app_verification_challenges to service_role;
create policy "Read own app jobs" on public.app_jobs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Read own app claims" on public.app_claims for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Read own app ownership" on public.app_owners for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.public_apps with (security_invoker = true) as
select a.id, a.name, a.tagline, a.description, a.website_url,
  a.canonical_host, a.logo_url, a.categories, a.tags, a.platforms,
  a.launched_at, a.discovered_at,
  s.source_url as launch_url, a.claim_state
from app_graph.apps a
left join app_graph.app_sources s on s.app_id = a.id
  and s.source_type = 'launch' and s.status = 'active' and s.match_state = 'attached'
where a.is_public;

-- The Edge Function is the only caller. A transaction-level host lock prevents
-- simultaneous submissions from creating two canonical apps.
create function public.resolve_app_submission(
  p_user_id uuid, p_job_id uuid, p_source_type text, p_external_id text,
  p_source_url text, p_normalized_source_url text, p_website_url text,
  p_canonical_host text, p_name text, p_description text, p_logo_url text,
  p_public_evidence jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_app_id uuid;
  v_source app_graph.app_sources%rowtype;
  v_candidates uuid[];
  v_count integer;
  v_result text;
begin
  if p_user_id is null or p_job_id is null or p_source_type not in ('website','launch','github','hacker_news')
    or length(p_name) not between 1 and 240 or p_website_url !~ '^https?://'
    or length(p_canonical_host) < 4 then raise exception 'Invalid app submission'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_canonical_host, 20260929));
  select * into v_source from app_graph.app_sources
    where (source_type = p_source_type and external_id = p_external_id)
      or (normalized_source_url = p_normalized_source_url and status = 'active')
    order by case when source_type = p_source_type and external_id = p_external_id then 0 else 1 end
    limit 1 for update;
  if found and v_source.match_state = 'ambiguous' then
    update public.app_jobs set status = 'needs_review', error = 'Source identity is ambiguous',
      updated_at = now() where id = p_job_id and user_id = p_user_id;
    return jsonb_build_object('outcome','ambiguous','reason','source_identity');
  end if;
  if found and v_source.app_id is not null then
    if not exists (select 1 from app_graph.apps a where a.id = v_source.app_id and a.is_public)
      and not exists (select 1 from public.app_jobs j where j.app_id = v_source.app_id
        and j.user_id = p_user_id) then
      update public.app_jobs set status = 'needs_review',
        error = 'A private submission already matches this source', updated_at = now()
        where id = p_job_id and user_id = p_user_id;
      return jsonb_build_object('outcome','ambiguous','reason','private_source');
    end if;
    v_app_id := v_source.app_id;
    v_result := 'existing';
  else
    if exists (select 1 from app_graph.app_sources s
      where s.source_type = 'launch' and s.match_state = 'ambiguous'
        and s.status = 'active'
        and pg_catalog.regexp_replace(pg_catalog.lower(s.website_url), '/$', '') = p_website_url) then
      update public.app_jobs set status = 'needs_review',
        error = 'Launch has multiple records for this website', updated_at = now()
        where id = p_job_id and user_id = p_user_id;
      return jsonb_build_object('outcome','ambiguous','reason','held_launch_website');
    end if;
    select array_agg(id order by id), count(*) into v_candidates, v_count
      from app_graph.apps where website_url = p_website_url;
    if v_count = 0 then
      select array_agg(id order by id), count(*) into v_candidates, v_count
        from app_graph.apps where canonical_host = p_canonical_host;
      if v_count > 0 then
        update public.app_jobs set status = 'needs_review',
          error = 'A listing already uses this website host', updated_at = now()
          where id = p_job_id and user_id = p_user_id;
        return jsonb_build_object('outcome','ambiguous','reason','host_match');
      end if;
    elsif v_count > 1 then
      update public.app_jobs set status = 'needs_review',
        error = 'Multiple listings match this website', updated_at = now()
        where id = p_job_id and user_id = p_user_id;
      return jsonb_build_object('outcome','ambiguous','reason','multiple_websites');
    end if;
    if v_count = 1 then
      if not exists (select 1 from app_graph.apps a where a.id = v_candidates[1] and a.is_public)
        and not exists (select 1 from public.app_jobs j where j.app_id = v_candidates[1]
          and j.user_id = p_user_id) then
        update public.app_jobs set status = 'needs_review',
          error = 'A private submission already matches this website', updated_at = now()
          where id = p_job_id and user_id = p_user_id;
        return jsonb_build_object('outcome','ambiguous','reason','private_website');
      end if;
      v_app_id := v_candidates[1];
      v_result := 'existing';
    else
      insert into app_graph.apps (
        seed_source_type, seed_source_external_id, name, description,
        website_url, canonical_host, logo_url, source_hash, is_public
      ) values (
        p_source_type, p_external_id, p_name, left(p_description, 2000),
        p_website_url, p_canonical_host, p_logo_url,
        pg_catalog.md5(p_source_url), false
      ) returning id into v_app_id;
      v_result := 'new';
      insert into app_graph.app_identity_events(app_id, event_type, details)
        values (v_app_id, 'user_app_created', jsonb_build_object('user_id',p_user_id,'job_id',p_job_id));
    end if;
  end if;
  -- New sources are attached only when creating a new app. For an existing app,
  -- an unverified submitter cannot add arbitrary provenance to its public page.
  if v_result = 'new' then
    insert into app_graph.app_sources (
      app_id, source_type, external_id, source_url, normalized_source_url,
      website_url, source_hash, match_state, public_evidence
    ) values (
      v_app_id, p_source_type, p_external_id, p_source_url,
      p_normalized_source_url, p_website_url,
      pg_catalog.md5(p_source_url), 'attached',
      coalesce(p_public_evidence,'{}'::jsonb)
    );
  end if;
  update public.app_jobs set status = 'complete', app_id = v_app_id,
    result = jsonb_build_object('outcome',v_result,'app_id',v_app_id,
      'name',p_name,'description',p_description,'website_url',p_website_url,'logo_url',p_logo_url),
    error = null, updated_at = now()
    where id = p_job_id and user_id = p_user_id;
  return jsonb_build_object('outcome',v_result,'app_id',v_app_id);
end;
$$;
revoke all on function public.resolve_app_submission(
  uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.resolve_app_submission(
  uuid,uuid,text,text,text,text,text,text,text,text,text,jsonb
) to service_role;

create function public.complete_app_domain_verification(
  p_challenge_id uuid, p_user_id uuid, p_token_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_challenge public.app_verification_challenges%rowtype;
  v_claim public.app_claims%rowtype; v_owner public.app_owners%rowtype;
begin
  select * into v_challenge from public.app_verification_challenges
    where id = p_challenge_id for update;
  if not found or v_challenge.user_id <> p_user_id or v_challenge.status <> 'pending'
    or v_challenge.expires_at <= now() or v_challenge.token_hash <> p_token_hash then
    raise exception 'Verification challenge is invalid or expired'; end if;
  select * into v_claim from public.app_claims where id = v_challenge.claim_id for update;
  if not found or v_claim.user_id <> p_user_id or v_claim.app_id <> v_challenge.app_id
    or v_claim.status not in ('pending','review') then raise exception 'Claim is not active'; end if;
  select * into v_owner from public.app_owners where app_id = v_claim.app_id for update;
  if found and v_owner.revoked_at is null and v_owner.user_id <> p_user_id then
    update public.app_claims set status = 'review', review_reason = 'Existing owner conflict'
      where id = v_claim.id;
    return jsonb_build_object('outcome','needs_review');
  end if;
  insert into public.app_owners(app_id,user_id,claim_id,verification_level)
    values(v_claim.app_id,p_user_id,v_claim.id,'domain_verified')
    on conflict (app_id) do update set user_id = excluded.user_id,
      claim_id = excluded.claim_id, verification_level = 'domain_verified',
      verified_at = now(), revoked_at = null
    where public.app_owners.user_id = excluded.user_id or public.app_owners.revoked_at is not null;
  update public.app_claims set status='verified', verification_state='domain_verified',
    completed_at=now() where id=v_claim.id;
  update public.app_verification_challenges set status='verified', verified_at=now()
    where id=v_challenge.id;
  update app_graph.apps set claim_state='domain_verified', is_public=true, updated_at=now()
    where id=v_claim.app_id;
  insert into app_graph.app_identity_events(app_id,event_type,details)
    values(v_claim.app_id,'claim_domain_verified',jsonb_build_object('claim_id',v_claim.id,'method',v_challenge.method));
  return jsonb_build_object('outcome','verified','app_id',v_claim.app_id);
end;
$$;
revoke all on function public.complete_app_domain_verification(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.complete_app_domain_verification(uuid,uuid,text)
  to service_role;

-- Daily Launch source refreshes remain evidence updates. They cannot overwrite
-- canonical fields after a Rocket ownership decision or hide an owned app.
create function app_graph.protect_claimed_canonical_app()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.app_owners o where o.app_id = old.id and o.revoked_at is null) then
    if new.source_hash is distinct from old.source_hash and old.seed_source_type = 'launch' then
      new.name := old.name;
      new.tagline := old.tagline;
      new.description := old.description;
      new.website_url := old.website_url;
      new.canonical_host := old.canonical_host;
      new.logo_url := old.logo_url;
      new.categories := old.categories;
      new.tags := old.tags;
      new.platforms := old.platforms;
    end if;
    if old.is_public then new.is_public := true; end if;
  end if;
  return new;
end;
$$;
create trigger protect_claimed_canonical_app
before update on app_graph.apps for each row
execute function app_graph.protect_claimed_canonical_app();

create function app_graph.audit_app_claim()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into app_graph.app_identity_events(app_id, event_type, details)
      values(new.app_id, 'claim_created', jsonb_build_object('claim_id',new.id,'method',new.method,'status',new.status));
  elsif new.status is distinct from old.status and new.status in ('rejected','revoked') then
    insert into app_graph.app_identity_events(app_id, event_type, details)
      values(new.app_id, 'claim_' || new.status, jsonb_build_object('claim_id',new.id));
  end if;
  return new;
end;
$$;
create trigger audit_app_claim after insert or update on public.app_claims
for each row execute function app_graph.audit_app_claim();

create function public.attach_verified_app_source(
  p_user_id uuid, p_app_id uuid, p_source_type text, p_external_id text,
  p_source_url text, p_normalized_source_url text, p_website_url text,
  p_public_evidence jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_source app_graph.app_sources%rowtype; v_app app_graph.apps%rowtype;
begin
  select * into v_app from app_graph.apps where id = p_app_id for update;
  if not found or p_source_type not in ('website','launch','github','hacker_news')
    or v_app.website_url <> p_website_url then raise exception 'Source does not match the verified app website'; end if;
  if not exists (select 1 from public.app_owners where app_id = p_app_id and user_id = p_user_id
    and verification_level = 'domain_verified' and revoked_at is null) then
    raise exception 'Verified app ownership required'; end if;
  select * into v_source from app_graph.app_sources
    where (source_type = p_source_type and external_id = p_external_id)
      or (normalized_source_url = p_normalized_source_url and status = 'active')
    order by id limit 1 for update;
  if found then
    if v_source.app_id = p_app_id and v_source.match_state = 'attached' then
      return jsonb_build_object('outcome','already_attached');
    end if;
    raise exception 'Source is already attached or needs identity review';
  end if;
  insert into app_graph.app_sources(app_id,source_type,external_id,source_url,
    normalized_source_url,website_url,source_hash,match_state,public_evidence)
    values(p_app_id,p_source_type,p_external_id,p_source_url,p_normalized_source_url,
      p_website_url,pg_catalog.md5(p_source_url),'attached',coalesce(p_public_evidence,'{}'::jsonb))
    returning * into v_source;
  insert into app_graph.app_identity_events(app_id,source_id,event_type,details)
    values(p_app_id,v_source.id,'owner_source_attached',jsonb_build_object('owner_id',p_user_id));
  return jsonb_build_object('outcome','attached','source_id',v_source.id);
end;
$$;
revoke all on function public.attach_verified_app_source(
  uuid,uuid,text,text,text,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.attach_verified_app_source(
  uuid,uuid,text,text,text,text,text,jsonb
) to service_role;

-- Preserve the proven Slice 1 importer while first reconciling exact source
-- URLs and exact canonical websites created by verified Rocket users.
alter function public.sync_launch_app_batch(uuid,jsonb)
  rename to sync_launch_app_batch_slice1;
create function public.sync_launch_app_batch(p_run_id uuid, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_source app_graph.app_sources%rowtype;
  v_app_id uuid; v_count integer; v_url text; v_website text; v_external text;
begin
  if not exists (select 1 from app_graph.app_import_jobs
    where id = p_run_id and status = 'running') then raise exception 'Import run is not active'; end if;
  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'Batch must contain at most 100 records'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    v_url := v_item->>'source_url';
    v_website := v_item->>'website_url';
    v_external := v_item->>'launch_id';
    if v_external is null or v_url !~ '^https://trylaunch[.]ai/launch/'
      or v_website !~ '^https?://' then raise exception 'Invalid public Launch record'; end if;
    if coalesce((v_item->>'ambiguous')::boolean,false) then continue; end if;
    if exists (select 1 from app_graph.app_sources
      where source_type='launch' and external_id=v_external) then continue; end if;
    select * into v_source from app_graph.app_sources
      where source_type='launch' and source_url=v_url and status='active'
      limit 1 for update;
    if found then
      if v_source.match_state='attached' and v_source.app_id is not null then
        update app_graph.app_sources set external_id=v_external where id=v_source.id;
      end if;
      continue;
    end if;
    select min(id), count(*) into v_app_id, v_count from app_graph.apps
      where website_url = pg_catalog.regexp_replace(v_website,'/$','');
    if v_count=1 and not exists (select 1 from app_graph.app_sources
      where source_type='launch' and source_url=v_url) then
      insert into app_graph.app_sources(app_id,source_type,external_id,source_url,
        normalized_source_url,website_url,source_hash,match_state,public_evidence,last_seen_run_id)
        values(v_app_id,'launch',v_external,v_url,v_url,v_website,v_item->>'source_hash',
          'attached',pg_catalog.jsonb_build_object('launch_date',v_item->>'launched_at'),p_run_id);
      insert into app_graph.app_identity_events(app_id,event_type,details)
        values(v_app_id,'launch_source_attached_to_existing',pg_catalog.jsonb_build_object('launch_id',v_external));
    end if;
  end loop;
  return public.sync_launch_app_batch_slice1(p_run_id,p_items);
end;
$$;
revoke all on function public.sync_launch_app_batch(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.sync_launch_app_batch(uuid,jsonb) to service_role;
