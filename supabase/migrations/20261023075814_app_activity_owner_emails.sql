-- Extend the existing transactional Resend outbox; no historical backfill.
create table public.app_activity_email_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default true
);
alter table public.app_activity_email_preferences enable row level security;
revoke all on public.app_activity_email_preferences from public, anon, authenticated;
grant select, insert, update on public.app_activity_email_preferences to authenticated;
grant all on public.app_activity_email_preferences to service_role;
create policy app_activity_email_preferences_read on public.app_activity_email_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy app_activity_email_preferences_create on public.app_activity_email_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy app_activity_email_preferences_update on public.app_activity_email_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table sharing_private.email_queue drop constraint email_queue_kind_check;
alter table sharing_private.email_queue add constraint email_queue_kind_check
  check (kind in ('published', 'claimed', 'recap', 'app_saved', 'app_collected'));

-- Private helper, called only by the existing privileged queue boundary.
-- A current owner takes precedence over the original founder submission.
create function sharing_private.app_activity_recipients(p_app_id uuid)
returns table(user_id uuid, email text)
language sql stable security invoker set search_path = '' as $$
  with managers as (
    select o.user_id from public.app_owners o
      where o.app_id = p_app_id and o.revoked_at is null
    union
    select d.submitted_by from public.app_submission_details d
      where d.app_id = p_app_id
        and not exists(select 1 from public.app_owners o where o.app_id = p_app_id)
  )
  select u.id, u.email from managers m join auth.users u on u.id = m.user_id
  join app_graph.apps a on a.id = p_app_id and a.is_public
  left join public.app_activity_email_preferences p on p.user_id = u.id
  where u.email is not null and u.email_confirmed_at is not null
    and u.deleted_at is null and not coalesce(u.is_anonymous, false)
    and coalesce(p.enabled, true)
    and not exists(select 1 from public.rocket_outreach_suppressions s where s.email = lower(u.email));
$$;
revoke all on function sharing_private.app_activity_recipients(uuid) from public, anon, authenticated;

create function sharing_private.capture_app_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  mail_kind text;
  app record;
  recipient record;
begin
  if not coalesce((select enabled from sharing_private.email_control where singleton), false)
    then return new; end if;
  if tg_table_name = 'saved_apps' then
    actor_id := new.user_id;
    mail_kind := 'app_saved';
  else
    select owner_id into actor_id from public.user_collections where id = new.collection_id;
    mail_kind := 'app_collected';
  end if;
  if not exists(select 1 from auth.users u where u.id = actor_id
      and u.email_confirmed_at is not null and u.deleted_at is null
      and not coalesce(u.is_anonymous, false)) then return new; end if;
  select id, name, slug into app from app_graph.apps where id = new.app_id and is_public;
  if app.id is null then return new; end if;
  for recipient in select * from sharing_private.app_activity_recipients(new.app_id)
    where user_id <> actor_id
  loop
    insert into sharing_private.email_queue(event_key, recipient, kind, context)
      values(mail_kind || ':' || new.app_id || ':' || actor_id || ':' || recipient.user_id,
        recipient.email, mail_kind,
        jsonb_build_object('app_id', app.id, 'app_name', app.name, 'app_slug', app.slug,
          'recipient_user_id', recipient.user_id))
      on conflict(event_key) do nothing;
    if found then perform sharing_private.dispatch_emails(); end if;
  end loop;
  return new;
end;
$$;
revoke all on function sharing_private.capture_app_activity() from public, anon, authenticated;
create trigger queue_app_save_email after insert on public.saved_apps
  for each row execute function sharing_private.capture_app_activity();
create trigger queue_app_collection_email after insert on public.collection_apps
  for each row execute function sharing_private.capture_app_activity();

-- Recheck preference, current app access and suppression at delivery time.
-- Existing publication/claim/recap behavior is preserved.
create or replace function public.lease_sharing_email(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q sharing_private.email_queue;
  recipient_email text;
begin
  update sharing_private.email_queue set attempts = attempts + 1,
    leased_until = now() + interval '5 minutes',
    available_at = now() + interval '5 minutes' * power(2, least(attempts, 6))
    where id = p_id and dispatch_token = p_token and sent_at is null and attempts < 8
      and available_at <= now() and (leased_until is null or leased_until < now())
      and created_at > now() - interval '23 hours'
    returning * into q;
  if q.id is null then return null; end if;
  if q.kind in ('app_saved', 'app_collected') then
    if coalesce((select enabled from sharing_private.email_control where singleton), false) then
      select r.email into recipient_email
        from sharing_private.app_activity_recipients((q.context->>'app_id')::uuid) r
        where r.user_id::text = q.context->>'recipient_user_id';
    end if;
    if recipient_email is null then
      update sharing_private.email_queue set attempts = 8, leased_until = null,
        last_error = 'App activity email no longer eligible' where id = q.id;
      return null;
    end if;
    q.recipient := recipient_email;
  end if;
  return jsonb_build_object('id',q.id,'recipient',q.recipient,'kind',q.kind,'context',q.context);
end;
$$;
revoke all on function public.lease_sharing_email(uuid, text) from public, anon, authenticated;
grant execute on function public.lease_sharing_email(uuid, text) to service_role;
