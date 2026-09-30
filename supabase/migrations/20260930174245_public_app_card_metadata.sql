-- Publish only aggregate save counts; the underlying saved_apps rows remain private.
create table public.app_save_counts (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  save_count integer not null default 0 check (save_count >= 0)
);
alter table public.app_save_counts enable row level security;
revoke all on public.app_save_counts from public, anon, authenticated;
grant select on public.app_save_counts to anon, authenticated;
grant all on public.app_save_counts to service_role;
create policy "Public app save counts" on public.app_save_counts for select
  to anon, authenticated using (
    exists (select 1 from app_graph.apps a where a.id = app_id and a.is_public)
  );

insert into public.app_save_counts (app_id, save_count)
select app_id, count(*)::integer from public.saved_apps group by app_id;

create function app_graph.sync_app_save_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.app_save_counts (app_id, save_count) values (new.app_id, 1)
      on conflict (app_id) do update set save_count = public.app_save_counts.save_count + 1;
    return new;
  end if;
  update public.app_save_counts
    set save_count = greatest(save_count - 1, 0) where app_id = old.app_id;
  return old;
end;
$$;
revoke all on function app_graph.sync_app_save_count() from public, anon, authenticated;
create trigger sync_app_save_count after insert or delete on public.saved_apps
  for each row execute function app_graph.sync_app_save_count();

-- A domain-verified owner may opt into a public @handle. Never infer one from
-- a source listing or from a private user profile.
alter table public.app_owner_presentations add column developer_handle text
  check (developer_handle is null or developer_handle ~ '^[A-Za-z0-9_]{2,30}$');
grant select (developer_handle) on public.app_owner_presentations to anon, authenticated;
create function app_graph.clear_stale_developer_handle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.app_owner_presentations set developer_handle = null where app_id = old.app_id;
    return old;
  end if;
  if new.revoked_at is not null or new.verification_level <> 'domain_verified'
      or new.user_id is distinct from old.user_id then
    update public.app_owner_presentations set developer_handle = null where app_id = new.app_id;
  end if;
  return new;
end;
$$;
revoke all on function app_graph.clear_stale_developer_handle() from public, anon, authenticated;
create trigger clear_stale_developer_handle after update or delete on public.app_owners
  for each row execute function app_graph.clear_stale_developer_handle();
create or replace view public.public_app_presentation with (security_invoker = true) as
select p.app_id, p.pricing_display, p.public_links, p.updated_at,
  p.developer_handle
from public.app_owner_presentations p;
revoke all on public.public_app_presentation from public;
grant select on public.public_app_presentation to anon, authenticated;

create view public.public_app_card_metadata with (security_invoker = true) as
select a.id as app_id, coalesce(s.save_count, 0) as save_count,
  coalesce(r.rating_count, 0) as rating_count, p.developer_handle
from public.public_apps a
left join public.app_save_counts s on s.app_id = a.id
left join public.public_app_review_summary r on r.app_id = a.id
left join public.public_app_presentation p on p.app_id = a.id;
revoke all on public.public_app_card_metadata from public;
grant select on public.public_app_card_metadata to anon, authenticated;
notify pgrst, 'reload schema';
