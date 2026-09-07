-- Return one existing preview candidate per requested project without sending
-- every asset payload to the Brand Kit index. SECURITY INVOKER keeps the
-- caller's normal RLS protections in effect.
create or replace function public.get_brand_index_previews(project_ids uuid[])
returns table (
  project_id uuid,
  asset_count bigint,
  preview_url text
)
language sql
security invoker
set search_path = public
as $$
  with ranked_assets as (
    select
      a.project_id,
      count(*) over (partition by a.project_id) as asset_count,
      coalesce(
        nullif(a.thumbnail_url, ''),
        nullif(a.flattened_url, ''),
        nullif(a.image_url, '')
      ) as preview_url,
      row_number() over (
        partition by a.project_id
        order by
          case when coalesce(a.thumbnail_url, a.flattened_url, a.image_url) is not null then 0 else 1 end,
          case when a.meta ->> 'saved_at' is not null then 0 else 1 end,
          case when a.asset_type in ('logo', 'icon', 'graphic', 'photo') then 0 else 1 end,
          a.created_at desc
      ) as row_number
    from public.assets a
    where a.project_id = any(project_ids)
      and a.user_id = auth.uid()
      and a.deleted_at is null
  )
  select project_id, asset_count, preview_url
  from ranked_assets
  where row_number = 1;
$$;

revoke all on function public.get_brand_index_previews(uuid[]) from public, anon;
grant execute on function public.get_brand_index_previews(uuid[]) to authenticated;
