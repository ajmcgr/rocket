-- Transactional mail for newly published apps and completed non-manual claims.
-- Delivery remains disabled until an authorized internal Resend acceptance passes.
create schema if not exists sharing_private;
revoke all on schema sharing_private from public, anon, authenticated;

create table sharing_private.email_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into sharing_private.email_control(singleton, enabled) values(true, false);
alter table sharing_private.email_control enable row level security;
revoke all on sharing_private.email_control from public, anon, authenticated;

create table sharing_private.email_queue (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient text not null,
  kind text not null check (kind in ('published', 'claimed')),
  context jsonb not null,
  dispatch_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  sent_at timestamptz,
  resend_id text,
  last_error text
);
alter table sharing_private.email_queue enable row level security;
revoke all on sharing_private.email_queue from public, anon, authenticated;
create index sharing_email_ready on sharing_private.email_queue(available_at)
  where sent_at is null;

create function sharing_private.dispatch_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  for q in select id, dispatch_token from sharing_private.email_queue
    where sent_at is null and attempts < 8 and available_at <= now()
      and (leased_until is null or leased_until < now())
      and created_at > now() - interval '23 hours'
    order by created_at limit 20
  loop
    perform net.http_post(
      url := 'https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/send-email',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('action','sharing_email','event_id',q.id,'dispatch_token',q.dispatch_token),
      timeout_milliseconds := 10000
    );
  end loop;
end; $$;
revoke all on function sharing_private.dispatch_emails() from public, anon, authenticated;

create function public.lease_sharing_email(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q sharing_private.email_queue;
begin
  update sharing_private.email_queue set attempts = attempts + 1,
    leased_until = now() + interval '5 minutes',
    available_at = now() + interval '5 minutes' * power(2, least(attempts, 6))
    where id = p_id and dispatch_token = p_token and sent_at is null and attempts < 8
      and available_at <= now() and (leased_until is null or leased_until < now())
      and created_at > now() - interval '23 hours'
    returning * into q;
  if q.id is null then return null; end if;
  return jsonb_build_object('id',q.id,'recipient',q.recipient,'kind',q.kind,'context',q.context);
end; $$;
revoke all on function public.lease_sharing_email(uuid, text) from public, anon, authenticated;
grant execute on function public.lease_sharing_email(uuid, text) to service_role;

create function public.finish_sharing_email(p_id uuid, p_token text, p_resend_id text, p_error text) returns void
language sql security definer set search_path = '' as $$
  update sharing_private.email_queue set
    sent_at = case when p_resend_id is not null then now() else null end,
    resend_id = p_resend_id, leased_until = null, last_error = left(p_error, 100)
    where id = p_id and dispatch_token = p_token and sent_at is null;
$$;
revoke all on function public.finish_sharing_email(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_sharing_email(uuid, text, text, text) to service_role;

create function sharing_private.capture_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient text; app record;
begin
  if not (select enabled from sharing_private.email_control where singleton) then return new; end if;
  select email into recipient from auth.users where id = new.submitted_by
    and email_confirmed_at is not null and deleted_at is null;
  select name, slug into app from app_graph.apps where id = new.app_id and is_public;
  if recipient is null or app.slug is null then return new; end if;
  insert into sharing_private.email_queue(event_key, recipient, kind, context)
    values('published:' || new.app_id, recipient, 'published',
      jsonb_build_object('app_name',app.name,'app_slug',app.slug))
    on conflict(event_key) do nothing;
  perform sharing_private.dispatch_emails();
  return new;
end; $$;
revoke all on function sharing_private.capture_publication() from public, anon, authenticated;
create trigger queue_app_publication_mail after insert on public.app_submission_details
  for each row execute function sharing_private.capture_publication();

create function sharing_private.capture_claim() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient text; app record; claim_method text;
begin
  if new.revoked_at is not null or not (select enabled from sharing_private.email_control where singleton)
    then return new; end if;
  if tg_op = 'UPDATE' and old.revoked_at is null then return new; end if;
  select method into claim_method from public.app_claims where id = new.claim_id;
  -- Manual decisions already send one approved mail from claim_private.email_queue.
  if claim_method = 'manual_review' then return new; end if;
  select email into recipient from auth.users where id = new.user_id
    and email_confirmed_at is not null and deleted_at is null;
  select name, slug, is_public into app from app_graph.apps where id = new.app_id;
  if recipient is null or app.slug is null then return new; end if;
  insert into sharing_private.email_queue(event_key, recipient, kind, context)
    values('claimed:' || new.claim_id, recipient, 'claimed',
      jsonb_build_object('app_name',app.name,'app_slug',app.slug,'verification_level',new.verification_level,'is_public',app.is_public))
    on conflict(event_key) do nothing;
  perform sharing_private.dispatch_emails();
  return new;
end; $$;
revoke all on function sharing_private.capture_claim() from public, anon, authenticated;
create trigger queue_app_claim_mail after insert or update on public.app_owners
  for each row execute function sharing_private.capture_claim();

select cron.schedule('rocket-sharing-email-retry', '*/5 * * * *',
  'select sharing_private.dispatch_emails()');
