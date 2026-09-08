-- Brand Kit membership is a historical relationship: an active project with
-- at least one active asset explicitly saved into that kit. Keep this query
-- separate from get_brand_index_previews so a preview candidate never makes a
-- project appear as a kit.
create or replace function public.get_brand_kit_membership(project_ids uuid[])
returns table (project_id uuid, asset_count bigint)
language sql
security invoker
set search_path = public
as $$
  select a.project_id, count(*) as asset_count
  from public.assets a
  join public.projects p
    on p.id = a.project_id
   and p.user_id = a.user_id
  where a.project_id = any(project_ids)
    and a.user_id = (select auth.uid())
    and p.user_id = (select auth.uid())
    and a.deleted_at is null
    and p.deleted_at is null
    and coalesce(a.meta ->> 'saved_at', '') <> ''
    -- The client has already scoped projects to the active workspace. Allow
    -- legacy assets without a workspace, but do not count another workspace's
    -- asset toward this kit.
    and (a.workspace_id is null or a.workspace_id = p.workspace_id)
  group by a.project_id;
$$;

revoke all on function public.get_brand_kit_membership(uuid[]) from public, anon;
grant execute on function public.get_brand_kit_membership(uuid[]) to authenticated;
