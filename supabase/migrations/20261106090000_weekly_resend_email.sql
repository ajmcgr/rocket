-- Weekly Rocket emails require an explicit, persistent opt-in.
create table public.weekly_email_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz
);
alter table public.weekly_email_preferences enable row level security;
revoke all on public.weekly_email_preferences from public, anon, authenticated;
grant select, insert(user_id, enabled), update(enabled) on public.weekly_email_preferences to authenticated;
grant all on public.weekly_email_preferences to service_role;
create policy weekly_email_preferences_read on public.weekly_email_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy weekly_email_preferences_create on public.weekly_email_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy weekly_email_preferences_update on public.weekly_email_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function sharing_private.stamp_weekly_email_opt_in() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.enabled then new.enabled_at := now(); end if;
  elsif new.enabled and not old.enabled then
    new.enabled_at := now();
  end if;
  if not new.enabled then new.enabled_at := null; end if;
  return new;
end;
$$;
create trigger stamp_weekly_email_opt_in before insert or update on public.weekly_email_preferences
  for each row execute function sharing_private.stamp_weekly_email_opt_in();

create table sharing_private.weekly_email_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into sharing_private.weekly_email_control(singleton) values (true);
alter table sharing_private.weekly_email_control enable row level security;
revoke all on sharing_private.weekly_email_control from public, anon, authenticated;

create table sharing_private.weekly_unsubscribe_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index weekly_unsubscribe_tokens_user on sharing_private.weekly_unsubscribe_tokens(user_id);
alter table sharing_private.weekly_unsubscribe_tokens enable row level security;
revoke all on sharing_private.weekly_unsubscribe_tokens from public, anon, authenticated;

alter table sharing_private.email_queue drop constraint email_queue_kind_check;
alter table sharing_private.email_queue add constraint email_queue_kind_check
  check (kind in ('published', 'claimed', 'recap', 'app_saved', 'app_collected', 'week_one', 'weekly'));

-- A bearer token can only turn off weekly emails for its own recipient.
create function public.unsubscribe_weekly_email(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  select user_id into v_user_id from sharing_private.weekly_unsubscribe_tokens
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_user_id is null then return false; end if;
  insert into public.weekly_email_preferences(user_id, enabled) values (v_user_id, false)
    on conflict (user_id) do update set enabled = false;
  delete from sharing_private.weekly_unsubscribe_tokens where user_id = v_user_id;
  return true;
end;
$$;
revoke all on function public.unsubscribe_weekly_email(text) from public;
grant execute on function public.unsubscribe_weekly_email(text) to anon, authenticated, service_role;

-- A weekly GitHub Action calls this; the UTC week key makes retries idempotent.
create function public.queue_weekly_emails(p_dry_run boolean default true) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user record;
  v_token text;
  v_week text := to_char(date_trunc('week', now() at time zone 'UTC'), 'YYYY-MM-DD');
  v_count integer := 0;
begin
  if not coalesce((select enabled from sharing_private.weekly_email_control where singleton), false)
    or not coalesce((select enabled from sharing_private.email_control where singleton), false)
  then return 0; end if;
  for v_user in
    select u.id, u.email from public.weekly_email_preferences p
    join auth.users u on u.id = p.user_id
    where p.enabled and p.enabled_at <= now() - interval '7 days'
      and u.email is not null and u.email_confirmed_at is not null
      and u.deleted_at is null and not coalesce(u.is_anonymous, false)
      and not exists (select 1 from public.rocket_outreach_suppressions s where s.email = lower(u.email))
      and not exists (select 1 from sharing_private.email_queue q where q.event_key = 'weekly:' || u.id || ':' || v_week)
    order by p.enabled_at, u.id limit 1000
    for update of p skip locked
  loop
    if p_dry_run then v_count := v_count + 1; continue; end if;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into sharing_private.email_queue(event_key, recipient, kind, context)
      values ('weekly:' || v_user.id || ':' || v_week, v_user.email, 'weekly',
        jsonb_build_object('recipient_user_id', v_user.id, 'unsubscribe_token', v_token))
      on conflict (event_key) do nothing;
    if found then
      insert into sharing_private.weekly_unsubscribe_tokens(user_id, token_hash)
        values (v_user.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
      v_count := v_count + 1;
    end if;
  end loop;
  if not p_dry_run and v_count > 0 then perform sharing_private.dispatch_emails(); end if;
  return v_count;
end;
$$;
revoke all on function public.queue_weekly_emails(boolean) from public, anon, authenticated;
grant execute on function public.queue_weekly_emails(boolean) to service_role;

-- Recheck the weekly preference immediately before Resend delivery.
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
  elsif q.kind = 'week_one' then
    if coalesce((select enabled from sharing_private.email_control where singleton), false)
       and coalesce((select enabled from sharing_private.week_one_email_control where singleton), false) then
      select u.email into recipient_email from auth.users u
        left join public.week_one_email_preferences p on p.user_id = u.id
        where u.id::text = q.context->>'recipient_user_id'
          and u.email_confirmed_at is not null and u.deleted_at is null
          and not coalesce(u.is_anonymous, false) and coalesce(p.enabled, true)
          and not exists (select 1 from public.rocket_outreach_suppressions s where s.email = lower(u.email))
          and (q.context->>'app_id' is null or exists (
            select 1 from public.app_owners o join app_graph.apps a on a.id = o.app_id
              where o.app_id::text = q.context->>'app_id' and o.user_id = u.id
                and o.revoked_at is null and a.is_public));
    end if;
    if recipient_email is null then
      update sharing_private.email_queue set attempts = 8, leased_until = null,
        last_error = 'Week-one email no longer eligible' where id = q.id;
      return null;
    end if;
    q.recipient := recipient_email;
  elsif q.kind = 'weekly' then
    if coalesce((select enabled from sharing_private.email_control where singleton), false)
       and coalesce((select enabled from sharing_private.weekly_email_control where singleton), false) then
      select u.email into recipient_email from auth.users u
        join public.weekly_email_preferences p on p.user_id = u.id
        where u.id::text = q.context->>'recipient_user_id'
          and p.enabled and p.enabled_at <= now() - interval '7 days'
          and u.email_confirmed_at is not null and u.deleted_at is null
          and not coalesce(u.is_anonymous, false)
          and not exists (select 1 from public.rocket_outreach_suppressions s where s.email = lower(u.email));
    end if;
    if recipient_email is null then
      update sharing_private.email_queue set attempts = 8, leased_until = null,
        last_error = 'Weekly email no longer eligible' where id = q.id;
      return null;
    end if;
    q.recipient := recipient_email;
  end if;
  return jsonb_build_object('id',q.id,'recipient',q.recipient,'kind',q.kind,'context',q.context);
end;
$$;
revoke all on function public.lease_sharing_email(uuid, text) from public, anon, authenticated;
grant execute on function public.lease_sharing_email(uuid, text) to service_role;
