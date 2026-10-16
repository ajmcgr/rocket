-- Deliver one private monthly Recap email through the existing idempotent
-- Resend outbox. The recipient can open /recap; no metrics are exposed in mail.
alter table sharing_private.email_queue
  drop constraint email_queue_kind_check;
alter table sharing_private.email_queue
  add constraint email_queue_kind_check
  check (kind in ('published', 'claimed', 'recap'));

create function sharing_private.queue_rocket_recap_email()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recipient text;
begin
  select u.email into recipient
  from auth.users u
  where u.id = new.user_id
    and u.email_confirmed_at is not null
    and u.deleted_at is null;
  if recipient is null then return new; end if;

  insert into sharing_private.email_queue(event_key, recipient, kind, context)
  values (
    'recap:' || new.user_id || ':' || to_char(new.month_start, 'YYYY-MM'),
    recipient,
    'recap',
    jsonb_build_object('month', new.month_start)
  )
  on conflict (event_key) do nothing;

  perform sharing_private.dispatch_emails();
  return new;
end;
$$;
revoke all on function sharing_private.queue_rocket_recap_email() from public, anon, authenticated;

create trigger queue_rocket_recap_email
  after insert on public.rocket_recaps
  for each row execute function sharing_private.queue_rocket_recap_email();
