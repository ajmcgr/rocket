-- A cover URL is the durable representation of a Brand Kit. Historic kits
-- predate that invariant, so /brands fell back to independently ranking
-- assets and could choose a later lockup instead of the source logo.
create table if not exists public.brand_cover_reference_backups (
  project_id uuid primary key references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prior_cover_url text,
  canonical_asset_id uuid not null references public.assets(id) on delete restrict,
  canonical_cover_url text not null,
  backed_up_at timestamptz not null default now()
);

alter table public.brand_cover_reference_backups enable row level security;
revoke all on table public.brand_cover_reference_backups from public, anon, authenticated;
grant select, insert on table public.brand_cover_reference_backups to service_role;

with asset_media as (
  select
    a.*,
    coalesce(
      nullif(case when a.thumbnail_url like 'data:image/%' then null else a.thumbnail_url end, ''),
      nullif(case when a.flattened_url like 'data:image/%' then null else a.flattened_url end, ''),
      nullif(case when a.image_url like 'data:image/%' then null else a.image_url end, '')
    ) as current_preview,
    coalesce(
      nullif(case when a.image_url like 'data:image/%' then null else a.image_url end, ''),
      nullif(case when a.thumbnail_url like 'data:image/%' then null else a.thumbnail_url end, ''),
      nullif(case when a.flattened_url like 'data:image/%' then null else a.flattened_url end, '')
    ) as canonical_preview
  from public.assets a
  where a.deleted_at is null
), current_pick as (
  select distinct on (project_id) project_id, id
  from asset_media
  order by project_id,
    case when meta ? 'saved_at' then 0 else 1 end,
    case when current_preview is not null then 0 else 2 end,
    case when asset_type in ('logo', 'icon', 'graphic', 'photo') then 0 else 1 end,
    created_at desc
), initial_saved as (
  select distinct on (project_id) project_id, id, canonical_preview
  from asset_media
  where meta ? 'saved_at' and canonical_preview is not null
  order by project_id, coalesce(nullif(meta ->> 'saved_at', '')::timestamptz, created_at), created_at, id
), source_logo as (
  select distinct on (p.id)
    p.id as project_id, a.id as canonical_asset_id, a.canonical_preview
  from public.projects p
  join asset_media lockup on lockup.project_id = p.id and lockup.meta ? 'saved_at'
  join asset_media a on a.user_id = p.user_id
    and lockup.meta ->> 'source_logo_url' in (a.image_url, a.thumbnail_url, a.flattened_url)
  where p.deleted_at is null
    and nullif(lockup.meta ->> 'source_logo_url', '') is not null
    and a.canonical_preview is not null
  order by p.id, lockup.created_at desc, a.created_at desc
), repairs as (
  -- A saved lockup explicitly names its source logo. If the old fallback chose
  -- the lockup (or a migrated legacy project cover), the source is canonical.
  select p.id as project_id, p.user_id, p.cover_url as prior_cover_url,
    s.canonical_asset_id, s.canonical_preview as canonical_cover_url
  from public.projects p
  join source_logo s on s.project_id = p.id
  join current_pick current on current.project_id = p.id
  left join public.legacy_brand_preview_backups legacy
    on legacy.project_id = p.id and legacy.asset_id is null and legacy.field_name = 'cover_url'
  where (p.cover_url is null and current.id <> s.canonical_asset_id)
     or (p.cover_url is not null and legacy.id is not null and p.cover_url is distinct from s.canonical_preview)

  union all

  -- Some older kits have neither a persisted cover nor a source-logo link.
  -- Their first explicitly saved asset is the creation seed; only repair when
  -- the current fallback demonstrably selects a different asset.
  select p.id as project_id, p.user_id, p.cover_url as prior_cover_url,
    initial.id as canonical_asset_id, initial.canonical_preview as canonical_cover_url
  from public.projects p
  join current_pick current on current.project_id = p.id
  join initial_saved initial on initial.project_id = p.id
  where p.deleted_at is null
    and p.cover_url is null
    and current.id <> initial.id
    and not exists (select 1 from source_logo s where s.project_id = p.id)
), backed_up as (
  insert into public.brand_cover_reference_backups (
    project_id, user_id, prior_cover_url, canonical_asset_id, canonical_cover_url
  )
  select project_id, user_id, prior_cover_url, canonical_asset_id, canonical_cover_url
  from repairs
  on conflict (project_id) do nothing
  returning project_id
)
update public.projects p
set cover_url = r.canonical_cover_url,
    updated_at = now()
from repairs r
where p.id = r.project_id
  and p.cover_url is distinct from r.canonical_cover_url;
