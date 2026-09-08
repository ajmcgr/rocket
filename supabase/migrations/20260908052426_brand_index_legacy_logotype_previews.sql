-- Preview selection remains separate from Brand Kit membership. A legacy
-- saved logotype has no image URL by design, so return its compact structured
-- state rather than falling back to initials or returning an inline image.
drop function if exists public.get_brand_index_previews(uuid[]);

create function public.get_brand_index_previews(project_ids uuid[])
returns table (project_id uuid, asset_count bigint, preview_url text, logotype_state jsonb)
language sql
security invoker
set search_path = public
as $$
  with ranked_assets as (
    select
      a.project_id,
      count(*) over (partition by a.project_id) as asset_count,
      case
        when coalesce(a.thumbnail_url, a.flattened_url, a.image_url) like 'data:image/%' then null
        else coalesce(nullif(a.thumbnail_url, ''), nullif(a.flattened_url, ''), nullif(a.image_url, ''))
      end as preview_url,
      case
        when jsonb_typeof(a.editor_state) = 'object' and a.editor_state ->> 'kind' = 'logotype'
          then a.editor_state
        else null
      end as logotype_state,
      row_number() over (
        partition by a.project_id
        order by
          case when a.meta ->> 'saved_at' is not null then 0 else 1 end,
          case when coalesce(a.thumbnail_url, a.flattened_url, a.image_url) like 'data:image/%' then 1 else 0 end,
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

revoke all on function public.get_brand_index_previews(uuid[]) from public, anon;
grant execute on function public.get_brand_index_previews(uuid[]) to authenticated;
