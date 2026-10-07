-- Production anon has column-level access to profile fields, not internal user_id.
-- Do NOT grant access to that identity column just to enable a collection join.
create schema collection_private;
revoke all on schema collection_private from public,anon,authenticated;
grant usage on schema collection_private to anon,authenticated;

-- Read-only publication projection: anonymous reads are intentional, but only
-- for a CURRENTLY PUBLIC collection. Never returns owner_id or private state.
-- Private schema is not exposed to PostgREST; no public SECURITY DEFINER RPC.
create function collection_private.public_curator(p_collection_id uuid)
returns table(username text,full_name text,avatar_url text)
language sql stable security definer set search_path='' as $$
  select p.username,p.full_name,p.avatar_url
  from public.user_collections c
  join public.member_public_profiles p on p.user_id=c.owner_id
  where c.id=p_collection_id and c.visibility='public'
$$;
revoke all on function collection_private.public_curator(uuid) from public,anon,authenticated;
grant execute on function collection_private.public_curator(uuid) to anon,authenticated;

create or replace view public.public_user_collections with (security_invoker=true) as
select c.id,c.name,c.slug,c.updated_at,p.username,p.full_name,p.avatar_url,
  (select count(*) from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id) as app_count,
  coalesce((select jsonb_agg(x.logo_url) from (select a.logo_url from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id order by ca.added_at desc,ca.app_id limit 6) x),'[]'::jsonb) as logos
from public.user_collections c left join lateral collection_private.public_curator(c.id) p on true
where c.visibility='public';
revoke all on public.public_user_collections from public,anon,authenticated;
grant select on public.public_user_collections to anon,authenticated;
