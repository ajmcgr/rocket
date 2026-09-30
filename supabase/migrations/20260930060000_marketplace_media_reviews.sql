-- Public Launch artwork remains source-attributed; the source URL is never
-- treated as an upload or as proof of ownership.
create table app_graph.app_media (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  source_type text not null check (source_type in ('launch', 'owner')),
  source_media_id text not null,
  media_type text not null check (media_type in ('thumbnail', 'screenshot', 'video')),
  source_url text not null check (source_url ~ '^https://'),
  sort_order integer not null default 0 check (sort_order >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_type, source_media_id)
);
create index app_media_app_order_idx on app_graph.app_media (app_id, media_type, sort_order, id);
alter table app_graph.app_media enable row level security;
grant select on app_graph.app_media to anon, authenticated;
grant all on app_graph.app_media to service_role;
create policy "Public media of public apps" on app_graph.app_media
  for select to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );
create view public.public_app_media with (security_invoker = true) as
select m.id, m.app_id, m.media_type, m.source_url, m.sort_order,
  m.source_type, m.first_seen_at
from app_graph.app_media m join app_graph.apps a on a.id = m.app_id
where a.is_public;
revoke all on public.public_app_media from public;
grant select on public.public_app_media to anon, authenticated;
create view public.public_app_media_covers with (security_invoker = true) as
select distinct on (m.app_id) m.id, m.app_id, m.media_type, m.source_url,
  m.sort_order, m.source_type
from app_graph.app_media m join app_graph.apps a on a.id = m.app_id
where a.is_public and m.media_type in ('thumbnail', 'screenshot')
order by m.app_id, case when m.source_type = 'owner' then 0 else 1 end,
  case when m.media_type = 'thumbnail' then 0 else 1 end, m.sort_order, m.id;
revoke all on public.public_app_media_covers from public;
grant select on public.public_app_media_covers to anon, authenticated;

-- Import only attached sources; ambiguous Launch rows cannot leak artwork
-- onto the wrong canonical app. Source media IDs make repeated runs idempotent.
create function public.sync_launch_app_media_batch(p_items jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_app_id uuid; v_count integer := 0; v_url text; v_type text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Invalid media batch';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_type := v_item->>'type'; v_url := v_item->>'url';
    if coalesce(length(v_item->>'id'), 0) not between 1 and 128
      or coalesce(length(v_item->>'product_id'), 0) not between 1 and 128
      or v_type not in ('thumbnail', 'screenshot', 'video')
      or length(coalesce(v_url, '')) > 2048
      or not (
        (v_type in ('thumbnail', 'screenshot') and v_url ~ '^https://gzpypxgdkxdynovploxn[.]supabase[.]co/storage/v1/object/public/product-media/')
        or (v_type = 'video' and v_url ~ '^https://(www[.])?(youtube[.]com/watch[?]|youtu[.]be/)')
      ) then raise exception 'Invalid Launch media record'; end if;
    select s.app_id into v_app_id from app_graph.app_sources s
      where s.source_type = 'launch' and s.external_id = v_item->>'product_id'
        and s.status = 'active' and s.match_state = 'attached';
    if v_app_id is null then continue; end if;
    insert into app_graph.app_media (app_id, source_type, source_media_id, media_type, source_url, sort_order)
      values (v_app_id, 'launch', v_item->>'id', v_type, v_url,
        coalesce((v_item->>'sort_order')::integer, 0))
      on conflict (source_type, source_media_id) do update set
        source_url = excluded.source_url, media_type = excluded.media_type,
        sort_order = excluded.sort_order, last_seen_at = now()
      where app_graph.app_media.app_id = excluded.app_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.sync_launch_app_media_batch(jsonb) from public, anon, authenticated;
grant execute on function public.sync_launch_app_media_batch(jsonb) to service_role;

create function public.replace_owner_app_media(p_app_id uuid, p_items jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_index integer := 0; v_ids text[] := '{}';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 8 then
    raise exception 'Invalid owner media list';
  end if;
  if not exists (select 1 from app_graph.apps where id = p_app_id) then
    raise exception 'Unknown app';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if (v_item->>'url') !~ '^https://' or length(v_item->>'url') > 2048
      or (v_item->>'type') not in ('screenshot', 'thumbnail') then
      raise exception 'Invalid owner media';
    end if;
    v_ids := array_append(v_ids, pg_catalog.md5(p_app_id::text || ':' || v_item->>'url'));
    insert into app_graph.app_media(app_id, source_type, source_media_id, media_type, source_url, sort_order)
      values (p_app_id, 'owner', pg_catalog.md5(p_app_id::text || ':' || v_item->>'url'), v_item->>'type', v_item->>'url', v_index)
      on conflict (source_type, source_media_id) do update set
        media_type = excluded.media_type, sort_order = excluded.sort_order, last_seen_at = now()
      where app_graph.app_media.app_id = excluded.app_id;
    v_index := v_index + 1;
  end loop;
  delete from app_graph.app_media where app_id = p_app_id and source_type = 'owner'
    and not (source_media_id = any(v_ids));
  return v_index;
end;
$$;
revoke all on function public.replace_owner_app_media(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_owner_app_media(uuid, jsonb) to service_role;

create table app_graph.app_reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 1000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, user_id)
);
create index app_reviews_public_idx on app_graph.app_reviews (app_id, created_at desc) where status = 'published';
alter table app_graph.app_reviews enable row level security;
grant select, insert, update, delete on app_graph.app_reviews to authenticated;
grant select on app_graph.app_reviews to anon;
grant all on app_graph.app_reviews to service_role;
create policy "Read published reviews or own review" on app_graph.app_reviews for select
  to anon, authenticated using (
    (status = 'published' and exists (
      select 1 from app_graph.apps a where a.id = app_id and a.is_public
    )) or (select auth.uid()) = user_id
  );
create policy "Write own review" on app_graph.app_reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'published'
    and exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public));
create policy "Edit own published review" on app_graph.app_reviews for update to authenticated
  using (user_id = (select auth.uid()) and status = 'published')
  with check (user_id = (select auth.uid()) and status = 'published');
create policy "Delete own review" on app_graph.app_reviews for delete to authenticated
  using (user_id = (select auth.uid()));
create function app_graph.protect_review_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.app_id is distinct from old.app_id or new.user_id is distinct from old.user_id
    or new.status is distinct from old.status or new.created_at is distinct from old.created_at then
    if auth.role() <> 'service_role' then
      raise exception 'Review identity and status cannot be changed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger protect_review_identity before update on app_graph.app_reviews
  for each row execute function app_graph.protect_review_identity();
create view public.public_app_reviews with (security_invoker = true) as
select r.id, r.app_id, r.user_id, r.rating, r.body, r.created_at, r.updated_at
from app_graph.app_reviews r join app_graph.apps a on a.id = r.app_id
where a.is_public and r.status = 'published';
revoke all on public.public_app_reviews from public;
grant select on public.public_app_reviews to anon, authenticated;
create view public.public_app_review_summary with (security_invoker = true) as
select r.app_id, count(*)::integer as rating_count,
  round(avg(r.rating)::numeric, 1) as average_rating
from app_graph.app_reviews r join app_graph.apps a on a.id = r.app_id
where a.is_public and r.status = 'published'
group by r.app_id;
revoke all on public.public_app_review_summary from public;
grant select on public.public_app_review_summary to anon, authenticated;

create table app_graph.app_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references app_graph.app_reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 500),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
alter table app_graph.app_review_reports enable row level security;
grant insert on app_graph.app_review_reports to authenticated;
grant all on app_graph.app_review_reports to service_role;
create policy "Report a public review" on app_graph.app_review_reports for insert
  to authenticated with check (reporter_id = (select auth.uid()) and
    exists (select 1 from app_graph.app_reviews r where r.id = review_id and r.status = 'published'));

create function public.upsert_app_review(p_app_id uuid, p_rating integer, p_body text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_rating not between 1 and 5
    or char_length(btrim(p_body)) not between 10 and 1000 then
    raise exception 'Invalid review';
  end if;
  insert into app_graph.app_reviews(app_id, user_id, rating, body)
    values (p_app_id, auth.uid(), p_rating, btrim(p_body))
    on conflict (app_id, user_id) do update set
      rating = excluded.rating, body = excluded.body
    returning id into v_id;
  return v_id;
end;
$$;
create function public.delete_app_review(p_app_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from app_graph.app_reviews where app_id = p_app_id and user_id = auth.uid();
  return found;
end;
$$;
create function public.report_app_review(p_review_id uuid, p_reason text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or char_length(btrim(p_reason)) not between 10 and 500 then
    raise exception 'Invalid report';
  end if;
  insert into app_graph.app_review_reports(review_id, reporter_id, reason)
    values (p_review_id, auth.uid(), btrim(p_reason))
    on conflict (review_id, reporter_id) do nothing;
  return true;
end;
$$;
revoke all on function public.upsert_app_review(uuid, integer, text),
  public.delete_app_review(uuid), public.report_app_review(uuid, text) from public, anon;
grant execute on function public.upsert_app_review(uuid, integer, text),
  public.delete_app_review(uuid), public.report_app_review(uuid, text) to authenticated;

-- Anonymous previews are capabilities, not apps or ownership. The raw token is
-- returned only to the browser and retained in same-tab session storage.
create table public.pending_app_previews (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  submitted_url text not null,
  preview jsonb not null,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by uuid references auth.users(id),
  consumed_at timestamptz
);
create index pending_app_previews_expiry_idx on public.pending_app_previews(expires_at)
  where consumed_at is null;
alter table public.pending_app_previews enable row level security;
revoke all on public.pending_app_previews from public, anon, authenticated;
grant all on public.pending_app_previews to service_role;

create table public.app_preview_attempts (
  id bigint generated always as identity primary key,
  client_hash text not null,
  created_at timestamptz not null default now()
);
create index app_preview_attempts_client_idx on public.app_preview_attempts(client_hash, created_at desc);
alter table public.app_preview_attempts enable row level security;
revoke all on public.app_preview_attempts from public, anon, authenticated;
grant all on public.app_preview_attempts to service_role;
grant usage, select on sequence public.app_preview_attempts_id_seq to service_role;

-- Preserve a founder's tiny manual category (or a category structured from
-- observed page text) only on the newly-created private submission. This can
-- never reclassify an existing Launch/public listing.
create function public.set_new_submission_category(p_user_id uuid, p_app_id uuid, p_category text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_app_id is null or p_category is null
    or char_length(btrim(p_category)) not between 2 and 80 then
    raise exception 'Invalid category';
  end if;
  update app_graph.apps a set categories = array[btrim(p_category)]
    where a.id = p_app_id and not a.is_public and
      exists (select 1 from public.app_jobs j where j.user_id = p_user_id
        and j.app_id = p_app_id and j.status = 'complete'
        and j.result->>'outcome' = 'new');
  return found;
end;
$$;
revoke all on function public.set_new_submission_category(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_new_submission_category(uuid, uuid, text) to service_role;

-- Owner presentation is an overlay, never a rewrite of Launch provenance.
create table public.app_owner_presentations (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 2 and 120),
  description text check (description is null or char_length(description) between 20 and 2000),
  logo_url text,
  category text,
  pricing_display text,
  public_links jsonb not null default '[]'::jsonb,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.app_owner_presentations enable row level security;
revoke all on public.app_owner_presentations from public;
grant select (app_id, display_name, description, logo_url, category,
  pricing_display, public_links, updated_at)
  on public.app_owner_presentations to anon, authenticated;
grant all on public.app_owner_presentations to service_role;
create policy "Public owner presentation" on public.app_owner_presentations for select
  to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );
create view public.public_app_presentation with (security_invoker = true) as
select app_id, pricing_display, public_links, updated_at
from public.app_owner_presentations;
revoke all on public.public_app_presentation from public;
grant select on public.public_app_presentation to anon, authenticated;

create or replace view public.public_apps with (security_invoker = true) as
select a.id, coalesce(p.display_name, a.name) as name, a.tagline,
  coalesce(p.description, a.description) as description,
  a.website_url, a.canonical_host, coalesce(p.logo_url, a.logo_url) as logo_url,
  case when p.category is not null then array[p.category] ||
    array(select unnest(a.categories) except select p.category) else a.categories end as categories,
  a.tags, a.platforms, a.launched_at, a.discovered_at,
  s.source_url as launch_url, a.claim_state
from app_graph.apps a
left join public.app_owner_presentations p on p.app_id = a.id
left join app_graph.app_sources s on s.app_id = a.id
  and s.source_type = 'launch' and s.status = 'active' and s.match_state = 'attached'
where a.is_public;
