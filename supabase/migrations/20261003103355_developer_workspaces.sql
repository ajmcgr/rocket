-- Shared workspaces are an account-level Rocket Developer benefit. Personal
-- storage remains free; expiration never deletes data or prevents cleanup.
create schema if not exists workspace_private;
revoke all on schema workspace_private from public, anon, authenticated;
grant usage on schema workspace_private to authenticated;

create function workspace_private.paid_owner(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.rocket_developer_memberships
    where user_id = p_owner and status = 'active' and current_period_end > now()
  );
$$;
revoke all on function workspace_private.paid_owner(uuid) from public, anon;
grant execute on function workspace_private.paid_owner(uuid) to authenticated;

create function workspace_private.can_use_team(p_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspaces w
    where w.id = p_workspace and not w.is_personal
      and (w.owner_id = auth.uid() or exists (
        select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid()
      )) and workspace_private.paid_owner(w.owner_id)
  );
$$;
revoke all on function workspace_private.can_use_team(uuid) from public, anon;
grant execute on function workspace_private.can_use_team(uuid) to authenticated;

-- A small authorized status RPC allows invited members to use the owner's plan
-- without exposing the owner's billing row or requiring duplicate subscriptions.
create function public.workspace_developer_access(_workspace_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select workspace_private.can_use_team(_workspace_id);
$$;
revoke all on function public.workspace_developer_access(uuid) from public, anon;
grant execute on function public.workspace_developer_access(uuid) to authenticated;

create function workspace_private.check_workspace_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id is distinct from old.owner_id or new.is_personal is distinct from old.is_personal) then
    raise exception 'Workspace ownership and personal status cannot be changed' using errcode = '42501';
  end if;
  if not new.is_personal and not exists (
    select 1 from public.rocket_developer_memberships
    where user_id = new.owner_id and status = 'active' and current_period_end > now()
  ) then
    raise exception 'An active Rocket Developer membership ($99/year) is required for shared workspaces' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function workspace_private.check_workspace_write() from public, anon, authenticated;
create trigger developer_workspace_write before insert or update on public.workspaces
for each row execute function workspace_private.check_workspace_write();

create function workspace_private.check_team_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.workspaces;
begin
  select * into w from public.workspaces where id = new.workspace_id;
  if w.id is null then raise exception 'Workspace not found'; end if;
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id or
     (tg_table_name = 'workspace_members' and to_jsonb(new)->>'user_id' is distinct from to_jsonb(old)->>'user_id')) then
    raise exception 'Workspace membership cannot be reassigned' using errcode = '42501';
  end if;
  if tg_table_name = 'workspace_members' and new.role = 'owner' then
    if (to_jsonb(new)->>'user_id')::uuid <> w.owner_id then raise exception 'Only the workspace owner may have the owner role' using errcode = '42501'; end if;
    return new; -- owner bootstrap remains possible for free personal storage
  end if;
  if tg_table_name = 'workspace_members' and tg_op = 'UPDATE' and old.role = 'owner' then
    raise exception 'The workspace owner role cannot be removed' using errcode = '42501';
  end if;
  if w.is_personal or not exists (
    select 1 from public.rocket_developer_memberships
    where user_id = w.owner_id and status = 'active' and current_period_end > now()
  ) then raise exception 'Shared team access requires the workspace owner to have an active Rocket Developer membership' using errcode = '42501'; end if;
  if tg_table_name = 'workspace_invites' and new.role = 'owner' then raise exception 'Owner invitations are not allowed' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function workspace_private.check_team_write() from public, anon, authenticated;
create trigger developer_team_members before insert or update on public.workspace_members
for each row execute function workspace_private.check_team_write();
create trigger developer_team_invites before insert on public.workspace_invites
for each row execute function workspace_private.check_team_write();

-- Restrictive rules compose with the existing owner/admin authorization rules.
create policy "Developer required for shared workspace inserts" on public.workspaces as restrictive
for insert to authenticated with check (owner_id = (select auth.uid()) and (is_personal or workspace_private.paid_owner(owner_id)));
create policy "Developer required for team invites" on public.workspace_invites as restrictive
for insert to authenticated with check (workspace_private.can_use_team(workspace_id));
create policy "Workspace members can read their team roster" on public.workspace_members
for select to authenticated using (public.is_workspace_member(workspace_id, (select auth.uid())));

-- Atomic personal creation replaces the partial browser insert/member fallback.
create function workspace_private.create_owned_workspace(p_name text, p_personal boolean)
returns public.workspaces language plpgsql security definer set search_path = '' as $$
declare w public.workspaces; u uuid := auth.uid();
begin
  if u is null then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_name), '') = '' or length(p_name) > 100 then raise exception 'Workspace name must be 1–100 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  if p_personal then
    select * into w from public.workspaces where owner_id = u and is_personal order by created_at limit 1;
  elsif not workspace_private.paid_owner(u) then
    raise exception 'An active Rocket Developer membership ($99/year) is required' using errcode = '42501';
  end if;
  if w.id is null then
    insert into public.workspaces(name,owner_id,is_personal) values(btrim(p_name),u,p_personal) returning * into w;
  end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(w.id,u,'owner') on conflict do nothing;
  return w;
end;
$$;
revoke all on function workspace_private.create_owned_workspace(text,boolean) from public, anon;
grant execute on function workspace_private.create_owned_workspace(text,boolean) to authenticated;
create or replace function public.create_workspace(_name text)
returns public.workspaces language sql security invoker set search_path = '' as $$
  select workspace_private.create_owned_workspace(_name, false);
$$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
create function public.ensure_personal_workspace(_name text)
returns public.workspaces language sql security invoker set search_path = '' as $$
  select workspace_private.create_owned_workspace(_name, true);
$$;
revoke all on function public.ensure_personal_workspace(text) from public, anon;
grant execute on function public.ensure_personal_workspace(text) to authenticated;
notify pgrst, 'reload schema';
