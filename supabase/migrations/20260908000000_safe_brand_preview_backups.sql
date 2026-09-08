create table if not exists public.legacy_brand_preview_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  field_name text not null check (field_name in ('cover_url','thumbnail_url','image_url')),
  original_value text not null,
  migrated_url text,
  created_at timestamptz not null default now(),
  migrated_at timestamptz,
  unique (asset_id, field_name),
  unique (project_id, field_name)
);
alter table public.legacy_brand_preview_backups enable row level security;
revoke all on public.legacy_brand_preview_backups from anon, authenticated;

create or replace function public.get_brand_index_previews(project_ids uuid[])
returns table (project_id uuid, asset_count bigint, preview_url text)
language sql security invoker set search_path = public as $$
  with ranked_assets as (
    select a.project_id, count(*) over (partition by a.project_id) as asset_count,
      case when coalesce(a.thumbnail_url,a.flattened_url,a.image_url) like 'data:image/%' then null
           else coalesce(nullif(a.thumbnail_url,''),nullif(a.flattened_url,''),nullif(a.image_url,'')) end as preview_url,
      row_number() over (partition by a.project_id order by
        case when coalesce(a.thumbnail_url,a.flattened_url,a.image_url) like 'data:image/%' then 1 else 0 end,
        case when a.meta ->> 'saved_at' is not null then 0 else 1 end,
        case when a.asset_type in ('logo','icon','graphic','photo') then 0 else 1 end, a.created_at desc) as row_number
    from public.assets a where a.project_id=any(project_ids) and a.user_id=auth.uid() and a.deleted_at is null
  ) select project_id,asset_count,preview_url from ranked_assets where row_number=1;
$$;
revoke all on function public.get_brand_index_previews(uuid[]) from public, anon;
grant execute on function public.get_brand_index_previews(uuid[]) to authenticated;
