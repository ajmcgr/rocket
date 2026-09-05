-- Restore the minimum reads needed to resolve a signed-in user's workspaces.
-- The membership policy intentionally exposes only the caller's own membership
-- rows, avoiding a recursive RLS policy on workspace_members.
create policy "Users can read their own workspace memberships"
on public.workspace_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Workspace owners and members can read workspaces"
on public.workspaces
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = (select auth.uid())
  )
);
