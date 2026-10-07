-- Publish only existing public app fields, never private owner/claim/user records.
-- Definer is necessary because visitors cannot read the ownership relationship.
create function public.get_public_member_apps(p_username text, p_offset integer default 0)
returns setof public.public_apps
language sql stable security definer
set search_path = ''
as $$
  select a.* from public.public_apps a
  join public.app_owners o on o.app_id = a.id and o.revoked_at is null
  join public.member_public_profiles p on p.user_id = o.user_id
  where p.username = lower(p_username)
  order by a.name, a.id
  limit 25 offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.get_public_member_apps(text,integer) from public;
grant execute on function public.get_public_member_apps(text,integer) to anon,authenticated,service_role;
