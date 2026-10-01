-- Public-design discovery must never bypass a share password. The following
-- one-argument project overload was added during the production security
-- review, then removed in the next migration after discovering an existing
-- password-aware overload with a default argument. Keep migration history
-- explicit so a fresh database reaches the same final state.
create or replace function public.get_public_designs(_limit integer default 200)
returns table(id uuid, user_id uuid, title text, asset_type public.asset_type,
  content text, image_url text, thumbnail_url text, prompt text,
  editor_state jsonb, meta jsonb, created_at timestamptz,
  updated_at timestamptz, share_token uuid, creator_username text)
language sql stable security definer set search_path to '' as $$
  select a.id, a.user_id, a.title, a.asset_type, a.content, a.image_url,
    a.thumbnail_url, a.prompt, a.editor_state, a.meta, a.created_at,
    a.updated_at, a.share_token,
    coalesce(nullif(p.handle, ''), nullif(p.full_name, ''), '@' || left(a.user_id::text, 8))
  from public.assets a
  left join public.profiles p on p.user_id = a.user_id
  where a.share_token is not null and a.share_password_hash is null
  order by a.created_at desc
  limit greatest(1, least(coalesce(_limit, 200), 500));
$$;

create or replace function public.get_shared_project(_token uuid)
returns jsonb language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('project', to_jsonb(p),
    'assets', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from public.assets a where a.project_id = p.id), '[]'::jsonb))
  from public.projects p
  where p.share_token = _token and p.share_password_hash is null
  limit 1;
$$;
