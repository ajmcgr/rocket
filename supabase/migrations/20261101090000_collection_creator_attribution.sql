-- Public collections may belong to creators who have not published a profile.
-- Read their existing handle or display name only for public collections.
-- A profile link is exposed only when that public profile actually exists.
create function collection_private.public_curator_attribution(p_collection_id uuid)
returns table(username text, full_name text, avatar_url text, profile_username text)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(p.username,
      case when lower(btrim(pr.handle)) ~ '^[a-z0-9_]{2,30}$' then lower(btrim(pr.handle)) end,
      case when lower(btrim(u.raw_user_meta_data->>'username')) ~ '^[a-z0-9_]{2,30}$'
        then lower(btrim(u.raw_user_meta_data->>'username')) end),
    coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(pr.full_name), ''),
      nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data->>'name'), '')),
    p.avatar_url,
    p.username
  from public.user_collections c
  left join public.member_public_profiles p on p.user_id = c.owner_id
  left join public.profiles pr on pr.user_id = c.owner_id
  left join auth.users u on u.id = c.owner_id
  where c.id = p_collection_id and c.visibility = 'public'
$$;
revoke all on function collection_private.public_curator_attribution(uuid) from public, anon, authenticated;
grant execute on function collection_private.public_curator_attribution(uuid) to anon, authenticated;

create or replace view public.public_user_collections with (security_invoker=true) as
select c.id, c.name, c.slug, c.updated_at, p.username, p.full_name, p.avatar_url,
  (select count(*) from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id) as app_count,
  coalesce((select jsonb_agg(x.logo_url) from (select a.logo_url from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id order by ca.added_at desc,ca.app_id limit 6) x),'[]'::jsonb) as logos,
  p.profile_username
from public.user_collections c left join lateral collection_private.public_curator_attribution(c.id) p on true
where c.visibility='public';
revoke all on public.public_user_collections from public, anon, authenticated;
grant select on public.public_user_collections to anon, authenticated;

notify pgrst, 'reload schema';
