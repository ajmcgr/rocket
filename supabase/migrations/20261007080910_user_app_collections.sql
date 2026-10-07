-- Existing saved_apps remains the canonical, private default Saved collection.
-- No saved rows, payment tables, merchant bindings or editorial collections change.
create table public.user_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  slug text not null unique,
  visibility text not null default 'private' check (visibility in ('private','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_collections_owner_updated_idx on public.user_collections(owner_id, updated_at desc, id);
create index user_collections_public_updated_idx on public.user_collections(updated_at desc, id) where visibility='public';

create table public.collection_apps (
  collection_id uuid not null references public.user_collections(id) on delete cascade,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(collection_id,app_id)
);
create index collection_apps_app_idx on public.collection_apps(app_id);

-- Invoker triggers: no privileged RPC surface and no caller-chosen owner, slug or dates.
create function public.prepare_user_collection() returns trigger
language plpgsql set search_path='' as $$
begin
  if TG_OP='INSERT' then
    new.slug := coalesce(nullif(left(trim(both '-' from regexp_replace(lower(new.name),'[^a-z0-9]+','-','g')),48),''),'collection') || '-' || replace(gen_random_uuid()::text,'-','');
    new.created_at := now();
  else
    new.id := old.id; new.owner_id := old.owner_id;
    new.slug := old.slug; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.prepare_user_collection() from public,anon,authenticated;
create trigger prepare_user_collection before insert or update on public.user_collections for each row execute function public.prepare_user_collection();

create function public.touch_user_collection() returns trigger
language plpgsql set search_path='' as $$
begin
  update public.user_collections set updated_at=now()
    where id=case when TG_OP='DELETE' then old.collection_id else new.collection_id end;
  return null;
end $$;
revoke all on function public.touch_user_collection() from public,anon,authenticated;
create trigger touch_user_collection after insert or delete on public.collection_apps for each row execute function public.touch_user_collection();

alter table public.user_collections enable row level security;
alter table public.collection_apps enable row level security;
create policy collections_read on public.user_collections for select to anon,authenticated
  using (visibility='public' or owner_id=(select auth.uid()));
create policy collections_create on public.user_collections for insert to authenticated
  with check(owner_id=(select auth.uid()));
create policy collections_update on public.user_collections for update to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy collections_delete on public.user_collections for delete to authenticated
  using(owner_id=(select auth.uid()));
create policy collection_apps_read on public.collection_apps for select to anon,authenticated
  using(exists(select 1 from public.user_collections c where c.id=collection_id
    and (c.owner_id=(select auth.uid()) or (c.visibility='public' and exists(select 1 from public.public_apps a where a.id=app_id)))));
create policy collection_apps_create on public.collection_apps for insert to authenticated
  with check(exists(select 1 from public.user_collections c where c.id=collection_id and c.owner_id=(select auth.uid()))
    and exists(select 1 from public.public_apps a where a.id=app_id));
create policy collection_apps_delete on public.collection_apps for delete to authenticated
  using(exists(select 1 from public.user_collections c where c.id=collection_id and c.owner_id=(select auth.uid())));

revoke all on public.user_collections, public.collection_apps from public,anon,authenticated;
grant select on public.user_collections, public.collection_apps to anon,authenticated;
grant insert(name,visibility),update(name,visibility,updated_at),delete on public.user_collections to authenticated;
grant insert(collection_id,app_id),delete on public.collection_apps to authenticated;
grant all on public.user_collections, public.collection_apps to service_role;

-- Public projection explicitly excludes private collections even for their owner.
-- Counts/artwork include only public listings. No purchase/history joins.
create view public.public_user_collections with (security_invoker=true) as
select c.id,c.name,c.slug,c.updated_at,p.username,p.full_name,p.avatar_url,
  (select count(*) from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id) as app_count,
  coalesce((select jsonb_agg(x.logo_url) from (select a.logo_url from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id order by ca.added_at desc,ca.app_id limit 6) x),'[]'::jsonb) as logos
from public.user_collections c left join public.member_public_profiles p on p.user_id=c.owner_id
where c.visibility='public';

create view public.my_user_collections with (security_invoker=true) as
select c.id,c.name,c.slug,c.visibility,c.updated_at,
  (select count(*) from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id) as app_count,
  coalesce((select jsonb_agg(x.logo_url) from (select a.logo_url from public.collection_apps ca join public.public_apps a on a.id=ca.app_id where ca.collection_id=c.id order by ca.added_at desc,ca.app_id limit 6) x),'[]'::jsonb) as logos
from public.user_collections c where c.owner_id=(select auth.uid());

create view public.my_saved_collection with (security_invoker=true) as
select 'Saved'::text as name,'saved'::text as slug,'private'::text as visibility,
  max(s.saved_at) as updated_at,count(a.id) as app_count,
  coalesce((select jsonb_agg(x.logo_url) from (select a2.logo_url from public.saved_apps s2 join public.public_apps a2 on a2.id=s2.app_id where s2.user_id=(select auth.uid()) order by s2.saved_at desc,s2.app_id limit 6) x),'[]'::jsonb) as logos
from public.saved_apps s join public.public_apps a on a.id=s.app_id where s.user_id=(select auth.uid());
revoke all on public.public_user_collections,public.my_user_collections,public.my_saved_collection from public,anon,authenticated;
grant select on public.public_user_collections to anon,authenticated;
grant select on public.my_user_collections,public.my_saved_collection to authenticated;

comment on view public.public_user_collections is 'Public-only community collections. Discovery should filter app_count > 0. Saved stays private in saved_apps.';

create view public.collection_visible_apps with (security_invoker=true) as
select ca.collection_id,ca.added_at,a.* from public.collection_apps ca join public.public_apps a on a.id=ca.app_id;
revoke all on public.collection_visible_apps from public,anon,authenticated;
grant select on public.collection_visible_apps to anon,authenticated;
