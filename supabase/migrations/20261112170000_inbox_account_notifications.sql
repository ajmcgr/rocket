-- Keep private Inbox activity in Rocket's existing notification bell.
-- A conversation has one reusable notification, so rapid replies do not flood it.
alter table public.account_notifications
  drop constraint account_notifications_kind_check;
alter table public.account_notifications
  add constraint account_notifications_kind_check
  check (kind in ('asset','export','project','system','app','monetize','billing','message'));

create function notification_private.capture_rocket_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation public.rocket_conversations;
  v_recipient uuid;
  v_sender text;
  v_app text;
begin
  select * into v_conversation from public.rocket_conversations where id = new.conversation_id;
  if v_conversation.id is null or new.sender_id not in (v_conversation.buyer_id,v_conversation.seller_id)
    then return new; end if;
  v_recipient := case when new.sender_id = v_conversation.buyer_id
    then v_conversation.seller_id else v_conversation.buyer_id end;
  if new.sender_id = v_recipient then return new; end if;
  select coalesce(nullif(btrim(full_name),''),nullif(btrim(username),''),'Rocket member')
    into v_sender from public.member_public_profiles where user_id = new.sender_id;
  select name into v_app from app_graph.apps where id = v_conversation.app_id;
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values (v_recipient,'message',
      'New message from ' || left(coalesce(v_sender,'Rocket member'),160),
      'About ' || left(coalesce(v_app,'an app'),180) || '. Open your Rocket Inbox to reply.',
      '/inbox?conversation=' || new.conversation_id::text,
      'inbox-conversation:' || new.conversation_id::text)
    on conflict (user_id,event_key) do update set
      title = excluded.title,
      body = excluded.body,
      href = excluded.href,
      created_at = now(),
      read_at = null,
      dismissed_at = null;
  return new;
exception when others then
  -- Notification failures must not prevent the message from being sent.
  raise warning 'Inbox notification capture failed (%)',SQLSTATE;
  return new;
end $$;
revoke all on function notification_private.capture_rocket_message() from public,anon,authenticated;
create trigger rocket_message_account_notification after insert on public.rocket_messages
  for each row execute function notification_private.capture_rocket_message();

create function notification_private.read_rocket_message_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_read_at is null or new.last_read_at is not distinct from old.last_read_at then
    return new;
  end if;
  update public.account_notifications set read_at = now()
    where user_id = new.user_id and kind = 'message'
      and event_key = 'inbox-conversation:' || new.conversation_id::text
      and read_at is null and created_at <= now();
  return new;
exception when others then
  raise warning 'Inbox notification read sync failed (%)',SQLSTATE;
  return new;
end $$;
revoke all on function notification_private.read_rocket_message_notification() from public,anon,authenticated;
create trigger rocket_message_account_notification_read after update of last_read_at
  on public.rocket_conversation_state for each row
  execute function notification_private.read_rocket_message_notification();
