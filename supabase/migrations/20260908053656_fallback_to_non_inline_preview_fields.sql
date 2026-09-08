create or replace function public.get_brand_index_previews(project_ids uuid[])
returns table (project_id uuid, asset_count bigint, preview_url text, logotype_state jsonb)
language sql
security invoker
set search_path = public
as $$
  with ranked_assets as (
    select
      a.project_id,
      count(*) over (partition by a.project_id) as asset_count,
      coalesce(
        nullif(case when a.thumbnail_url like 'data:image/%' then null else a.thumbnail_url end, ''),
        nullif(case when a.flattened_url like 'data:image/%' then null else a.flattened_url end, ''),
        nullif(case when a.image_url like 'data:image/%' then null else a.image_url end, '')
      ) as preview_url,
      case when jsonb_typeof(a.editor_state) = 'object' and a.editor_state ->> 'kind' = 'logotype'
        then a.editor_state else null end as logotype_state,
      row_number() over (
        partition by a.project_id
        order by
          case when a.meta ->> 'saved_at' is not null then 0 else 1 end,
          case when coalesce(
            nullif(case when a.thumbnail_url like 'data:image/%' then null else a.thumbnail_url end, ''),
            nullif(case when a.flattened_url like 'data:image/%' then null else a.flattened_url end, ''),
            nullif(case when a.image_url like 'data:image/%' then null else a.image_url end, '')
          ) is not null then 0
          when jsonb_typeof(a.editor_state) = 'object' and a.editor_state ->> 'kind' = 'logotype' then 1
          else 2 end,
          case when a.asset_type in ('logo','icon','graphic','photo') then 0 else 1 end,
          a.created_at desc
      ) as row_number
    from public.assets a
    where a.project_id = any(project_ids)
      and a.user_id = (select auth.uid())
      and a.deleted_at is null
  )
  select project_id, asset_count, preview_url, logotype_state
  from ranked_assets
  where row_number = 1;
$$;
