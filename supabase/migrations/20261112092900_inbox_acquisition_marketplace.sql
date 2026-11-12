-- Acquisition listings remain private until a domain-verified owner submits
-- them and an administrator approves the seller's authority to advertise.
create table public.rocket_acquisition_listings (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'not_for_sale' check (status in ('not_for_sale','open_to_offers','for_sale')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  asking_price_cents bigint check (asking_price_cents is null or asking_price_cents between 100 and 100000000000),
  currency text not null default 'usd' check (currency = 'usd'),
  description text not null default '' check (length(description) <= 1000),
  reason_for_selling text not null default '' check (length(reason_for_selling) <= 500),
  preferred_buyer text not null default '' check (length(preferred_buyer) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  check (status = 'for_sale' or asking_price_cents is null)
);
create index rocket_acquisition_public_idx on public.rocket_acquisition_listings(updated_at desc,app_id)
  where status <> 'not_for_sale' and review_status = 'approved';
alter table public.rocket_acquisition_listings enable row level security;
revoke all on public.rocket_acquisition_listings from public,anon,authenticated;
grant select on public.rocket_acquisition_listings to authenticated;
grant all on public.rocket_acquisition_listings to service_role;
create function public.rocket_listing_is_public(p_app_id uuid,p_seller_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
    where o.app_id=p_app_id and o.user_id=p_seller_id and o.verification_level='domain_verified'
      and o.revoked_at is null and a.is_public);
$$;
revoke all on function public.rocket_listing_is_public(uuid,uuid) from public;
grant execute on function public.rocket_listing_is_public(uuid,uuid) to anon,authenticated;
create policy acquisition_listing_owner_read on public.rocket_acquisition_listings for select to authenticated
  using ((select auth.uid()) = seller_user_id);
-- The public projection excludes the seller UUID and private notes.
create view public.public_rocket_acquisition_listings with (security_barrier=true) as
  select app_id,status,review_status,asking_price_cents,currency,description,updated_at
  from public.rocket_acquisition_listings
  where status <> 'not_for_sale' and review_status='approved'
    and public.rocket_listing_is_public(app_id,seller_user_id);
revoke all on public.public_rocket_acquisition_listings from public,anon,authenticated;
grant select on public.public_rocket_acquisition_listings to anon,authenticated;

create function public.set_rocket_acquisition_listing(
  p_app_id uuid, p_status text, p_asking_price_cents bigint default null,
  p_description text default '', p_reason text default '', p_preferred_buyer text default ''
) returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_previous public.rocket_acquisition_listings; v_review text;
begin
  if v_user is null or p_status not in ('not_for_sale','open_to_offers','for_sale')
    or p_asking_price_cents is not null and (p_asking_price_cents < 100 or p_asking_price_cents > 100000000000)
    or (p_status <> 'for_sale' and p_asking_price_cents is not null)
    or length(coalesce(p_description,'')) > 1000 or length(coalesce(p_reason,'')) > 500
    or length(coalesce(p_preferred_buyer,'')) > 500 then
    raise exception 'Invalid acquisition listing' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
    where o.app_id=p_app_id and o.user_id=v_user and o.revoked_at is null
      and o.verification_level='domain_verified' and a.is_public) then
    raise exception 'Domain-verified app ownership required' using errcode='42501';
  end if;
  select * into v_previous from public.rocket_acquisition_listings where app_id=p_app_id for update;
  if v_previous.app_id is not null and v_previous.seller_user_id <> v_user and exists (
    select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=v_previous.seller_user_id
      and o.verification_level='domain_verified' and o.revoked_at is null) then
    raise exception 'Listing belongs to another seller' using errcode='42501';
  end if;
  v_review := case when p_status='not_for_sale' then 'pending'
    when v_previous.app_id is not null and v_previous.seller_user_id=v_user and v_previous.review_status='approved'
      and v_previous.status=p_status and v_previous.asking_price_cents is not distinct from p_asking_price_cents
      and v_previous.description=coalesce(p_description,'')
      and v_previous.reason_for_selling=coalesce(p_reason,'')
      and v_previous.preferred_buyer=coalesce(p_preferred_buyer,'') then 'approved'
    else 'pending' end;
  insert into public.rocket_acquisition_listings(app_id,seller_user_id,status,review_status,asking_price_cents,
    description,reason_for_selling,preferred_buyer)
  values(p_app_id,v_user,p_status,v_review,p_asking_price_cents,coalesce(p_description,''),
    coalesce(p_reason,''),coalesce(p_preferred_buyer,''))
    on conflict(app_id) do update set seller_user_id=excluded.seller_user_id,status=excluded.status,review_status=excluded.review_status,
    asking_price_cents=excluded.asking_price_cents,description=excluded.description,
    reason_for_selling=excluded.reason_for_selling,preferred_buyer=excluded.preferred_buyer,
    approved_at=case when excluded.review_status='approved' then rocket_acquisition_listings.approved_at else null end,
    updated_at=now();
  return v_review;
end $$;
revoke all on function public.set_rocket_acquisition_listing(uuid,text,bigint,text,text,text) from public,anon;
grant execute on function public.set_rocket_acquisition_listing(uuid,text,bigint,text,text,text) to authenticated;

create function public.rocket_admin_acquisition_queue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_rocket_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'app_id',l.app_id,'app_name',a.name,'seller_user_id',l.seller_user_id,
    'status',l.status,'asking_price_cents',l.asking_price_cents,'description',l.description,
    'reason_for_selling',l.reason_for_selling,'preferred_buyer',l.preferred_buyer,'updated_at',l.updated_at
  ) order by l.updated_at desc),'[]'::jsonb)
  else '[]'::jsonb end
  from public.rocket_acquisition_listings l join app_graph.apps a on a.id=l.app_id
  where l.review_status='pending' and l.status<>'not_for_sale';
$$;
revoke all on function public.rocket_admin_acquisition_queue() from public,anon;
grant execute on function public.rocket_admin_acquisition_queue() to authenticated;

create function public.rocket_admin_review_acquisition(p_app_id uuid,p_approve boolean,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_rocket_admin() or length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Admin review and reason required' using errcode='42501';
  end if;
  update public.rocket_acquisition_listings l set review_status=case when p_approve then 'approved' else 'rejected' end,
    approved_at=case when p_approve then now() else null end,updated_at=now()
  where l.app_id=p_app_id and l.review_status='pending' and l.status<>'not_for_sale'
    and exists (select 1 from public.app_owners o where o.app_id=l.app_id and o.user_id=l.seller_user_id
      and o.verification_level='domain_verified' and o.revoked_at is null);
  if not found then raise exception 'Pending verified listing not found' using errcode='P0002'; end if;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values((select auth.uid()),case when p_approve then 'acquisition_approve' else 'acquisition_reject' end,
      'app',p_app_id::text,jsonb_build_object('reason',left(p_reason,500)));
end $$;
revoke all on function public.rocket_admin_review_acquisition(uuid,boolean,text) from public,anon;
grant execute on function public.rocket_admin_review_acquisition(uuid,boolean,text) to authenticated;

create table public.rocket_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'acquisition' check (type='acquisition'),
  app_id uuid not null references app_graph.apps(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_sender_id uuid references auth.users(id) on delete set null,
  last_message_preview text,
  unique(app_id,buyer_id,seller_id),
  check(buyer_id <> seller_id)
);
create index rocket_conversations_buyer_idx on public.rocket_conversations(buyer_id,last_activity_at desc);
create index rocket_conversations_seller_idx on public.rocket_conversations(seller_id,last_activity_at desc);
create table public.rocket_conversation_state (
  conversation_id uuid not null references public.rocket_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  archived_at timestamptz,
  primary key(conversation_id,user_id)
);
create table public.rocket_messages (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  conversation_id uuid not null references public.rocket_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  client_message_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique(conversation_id,sender_id,client_message_id)
);
create index rocket_messages_history_idx on public.rocket_messages(conversation_id,sequence desc);
create index rocket_messages_sender_rate_idx on public.rocket_messages(sender_id,created_at desc);
create table public.rocket_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);
create table public.rocket_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.rocket_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(message_id,reporter_id)
);
create table public.rocket_inbox_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true
);

alter table public.rocket_conversations enable row level security;
alter table public.rocket_conversation_state enable row level security;
alter table public.rocket_messages enable row level security;
alter table public.rocket_user_blocks enable row level security;
alter table public.rocket_message_reports enable row level security;
alter table public.rocket_inbox_email_preferences enable row level security;
revoke all on public.rocket_conversations,public.rocket_conversation_state,public.rocket_messages,
  public.rocket_user_blocks,public.rocket_message_reports,public.rocket_inbox_email_preferences
  from public,anon,authenticated;
grant select on public.rocket_conversations,public.rocket_conversation_state,public.rocket_messages,
  public.rocket_user_blocks,public.rocket_message_reports,public.rocket_inbox_email_preferences to authenticated;
grant update(last_read_at,archived_at) on public.rocket_conversation_state to authenticated;
grant insert(blocker_id,blocked_id),delete on public.rocket_user_blocks to authenticated;
grant insert(message_id,reporter_id,reason) on public.rocket_message_reports to authenticated;
grant insert(user_id,enabled),update(enabled) on public.rocket_inbox_email_preferences to authenticated;
grant all on public.rocket_conversations,public.rocket_conversation_state,public.rocket_messages,
  public.rocket_user_blocks,public.rocket_message_reports,public.rocket_inbox_email_preferences to service_role;
create policy own_conversations on public.rocket_conversations for select to authenticated
  using ((select auth.uid()) in (buyer_id,seller_id));
create policy own_conversation_state_read on public.rocket_conversation_state for select to authenticated
  using ((select auth.uid())=user_id);
create policy own_conversation_state_update on public.rocket_conversation_state for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy participant_messages on public.rocket_messages for select to authenticated
  using (exists (select 1 from public.rocket_conversations c where c.id=conversation_id
    and (select auth.uid()) in (c.buyer_id,c.seller_id)));
create policy own_blocks_read on public.rocket_user_blocks for select to authenticated
  using ((select auth.uid())=blocker_id);
create policy own_blocks_create on public.rocket_user_blocks for insert to authenticated
  with check ((select auth.uid())=blocker_id);
create policy own_blocks_remove on public.rocket_user_blocks for delete to authenticated
  using ((select auth.uid())=blocker_id);
create policy own_reports_read on public.rocket_message_reports for select to authenticated
  using ((select auth.uid())=reporter_id);
create policy participant_reports_create on public.rocket_message_reports for insert to authenticated
  with check ((select auth.uid())=reporter_id and exists (
    select 1 from public.rocket_messages m join public.rocket_conversations c on c.id=m.conversation_id
    where m.id=message_id and (select auth.uid()) in (c.buyer_id,c.seller_id) and m.sender_id <> reporter_id));
create policy own_inbox_email_read on public.rocket_inbox_email_preferences for select to authenticated
  using ((select auth.uid())=user_id);
create policy own_inbox_email_insert on public.rocket_inbox_email_preferences for insert to authenticated
  with check ((select auth.uid())=user_id);
create policy own_inbox_email_update on public.rocket_inbox_email_preferences for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Moderators see report metadata and the reporter's reason, never message
-- content. Every resolution is recorded in the existing admin audit log.
create function public.rocket_admin_message_reports() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_rocket_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'message_id',r.message_id,'reporter_id',r.reporter_id,
    'reason',r.reason,'created_at',r.created_at,'sender_id',m.sender_id
  ) order by r.created_at desc),'[]'::jsonb) else '[]'::jsonb end
  from public.rocket_message_reports r join public.rocket_messages m on m.id=r.message_id
  where r.reviewed_at is null;
$$;
revoke all on function public.rocket_admin_message_reports() from public,anon;
grant execute on function public.rocket_admin_message_reports() to authenticated;
create function public.rocket_admin_review_message_report(p_report_id uuid,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_rocket_admin() or length(btrim(coalesce(p_reason,'')))<5 then
    raise exception 'Admin review and reason required' using errcode='42501';
  end if;
  update public.rocket_message_reports set reviewed_at=now() where id=p_report_id and reviewed_at is null;
  if not found then raise exception 'Open report not found' using errcode='P0002'; end if;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values((select auth.uid()),'message_report_reviewed','message_report',p_report_id::text,
      jsonb_build_object('reason',left(p_reason,500)));
end $$;
revoke all on function public.rocket_admin_review_message_report(uuid,text) from public,anon;
grant execute on function public.rocket_admin_review_message_report(uuid,text) to authenticated;

-- These two narrow RPCs are the only write entry points for conversations and
-- messages. Every row derives its sender from the verified JWT, never input.
create function public.start_rocket_acquisition_conversation(p_app_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_buyer uuid := (select auth.uid()); v_seller uuid; v_id uuid;
begin
  if v_buyer is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select l.seller_user_id into v_seller from public.rocket_acquisition_listings l
    join public.app_owners o on o.app_id=l.app_id and o.user_id=l.seller_user_id
    join app_graph.apps a on a.id=l.app_id
    where l.app_id=p_app_id and l.status<>'not_for_sale' and l.review_status='approved'
      and o.verification_level='domain_verified' and o.revoked_at is null and a.is_public;
  if v_seller is null then raise exception 'Listing not available' using errcode='P0002'; end if;
  if v_buyer=v_seller then raise exception 'Cannot message yourself' using errcode='22023'; end if;
  if exists(select 1 from public.rocket_user_blocks b where (b.blocker_id=v_buyer and b.blocked_id=v_seller)
    or (b.blocker_id=v_seller and b.blocked_id=v_buyer)) then
    raise exception 'Contact unavailable' using errcode='42501';
  end if;
  select id into v_id from public.rocket_conversations
    where app_id=p_app_id and buyer_id=v_buyer and seller_id=v_seller;
  if v_id is not null then
    update public.rocket_conversation_state set archived_at=null where conversation_id=v_id and user_id=v_buyer;
    return v_id;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_buyer::text,1));
  if (select count(*) from public.rocket_conversations c where c.buyer_id=v_buyer
    and c.created_at>now()-interval '1 day') >= 20 then
    raise exception 'Conversation limit reached' using errcode='42901';
  end if;
  insert into public.rocket_conversations(app_id,buyer_id,seller_id)
    values(p_app_id,v_buyer,v_seller)
    on conflict(app_id,buyer_id,seller_id) do update set id=rocket_conversations.id
    returning id into v_id;
  insert into public.rocket_conversation_state(conversation_id,user_id) values(v_id,v_buyer),(v_id,v_seller)
    on conflict do nothing;
  update public.rocket_conversation_state set archived_at=null where conversation_id=v_id and user_id=v_buyer;
  return v_id;
end $$;
revoke all on function public.start_rocket_acquisition_conversation(uuid) from public,anon;
grant execute on function public.start_rocket_acquisition_conversation(uuid) to authenticated;

create function public.send_rocket_message(p_conversation_id uuid,p_body text,p_client_message_id uuid)
returns public.rocket_messages language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_conv public.rocket_conversations; v_message public.rocket_messages;
begin
  if v_user is null or p_client_message_id is null or length(btrim(coalesce(p_body,''))) not between 1 and 4000 then
    raise exception 'Invalid message' using errcode='22023';
  end if;
  select * into v_conv from public.rocket_conversations where id=p_conversation_id;
  if v_conv.id is null or v_user not in (v_conv.buyer_id,v_conv.seller_id) then
    raise exception 'Conversation access denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.app_owners o where o.app_id=v_conv.app_id and o.user_id=v_conv.seller_id
    and o.verification_level='domain_verified' and o.revoked_at is null) then
    raise exception 'Seller ownership is no longer verified' using errcode='42501';
  end if;
  if exists(select 1 from public.rocket_user_blocks b where (b.blocker_id=v_conv.buyer_id and b.blocked_id=v_conv.seller_id)
    or (b.blocker_id=v_conv.seller_id and b.blocked_id=v_conv.buyer_id)) then
    raise exception 'Conversation blocked' using errcode='42501';
  end if;
  select * into v_message from public.rocket_messages where conversation_id=p_conversation_id
    and sender_id=v_user and client_message_id=p_client_message_id;
  if v_message.id is not null then return v_message; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  if (select count(*) from public.rocket_messages where sender_id=v_user
    and created_at>now()-interval '1 minute') >= 10 or
    (select count(*) from public.rocket_messages where sender_id=v_user
    and created_at>now()-interval '1 day') >= 100 then
    raise exception 'Message rate limit reached' using errcode='42901';
  end if;
  insert into public.rocket_messages(conversation_id,sender_id,client_message_id,body)
    values(p_conversation_id,v_user,p_client_message_id,btrim(p_body))
    on conflict(conversation_id,sender_id,client_message_id) do update set id=rocket_messages.id
    returning * into v_message;
  update public.rocket_conversations set last_activity_at=v_message.created_at,last_message_at=v_message.created_at,
    last_message_sender_id=v_user,last_message_preview=left(v_message.body,140)
    where id=p_conversation_id and (last_message_at is null or last_message_at<=v_message.created_at);
  update public.rocket_conversation_state set archived_at=null where conversation_id=p_conversation_id;
  return v_message;
end $$;
revoke all on function public.send_rocket_message(uuid,text,uuid) from public,anon;
grant execute on function public.send_rocket_message(uuid,text,uuid) to authenticated;

-- Content-free transactional notifications. The private queue stores user IDs
-- and a one-use dispatch capability; the email address is resolved at delivery.
create schema if not exists inbox_private;
revoke all on schema inbox_private from public,anon,authenticated;
create table inbox_private.email_queue (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.rocket_messages(id) on delete cascade,
  conversation_id uuid not null references public.rocket_conversations(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  dispatch_token text not null default encode(extensions.gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  resend_id text,
  last_error text
);
alter table inbox_private.email_queue enable row level security;
revoke all on inbox_private.email_queue from public,anon,authenticated;
create index rocket_inbox_email_ready on inbox_private.email_queue(available_at)
  where sent_at is null;
create index rocket_inbox_email_throttle on inbox_private.email_queue(conversation_id,recipient_id,created_at desc);

create function inbox_private.dispatch_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare q record;
begin
  for q in select id,dispatch_token from inbox_private.email_queue
    where sent_at is null and attempts<8 and available_at<=now()
      and (leased_until is null or leased_until<now())
      and created_at>now()-interval '7 days'
    order by created_at limit 20
  loop
    perform net.http_post(
      url:='https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/send-email',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:=jsonb_build_object('action','inbox_email','event_id',q.id,'dispatch_token',q.dispatch_token),
      timeout_milliseconds:=10000
    );
  end loop;
end $$;
revoke all on function inbox_private.dispatch_emails() from public,anon,authenticated;
select cron.schedule('rocket-inbox-email-retry','*/5 * * * *','select inbox_private.dispatch_emails()');

create function inbox_private.queue_message_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conversation public.rocket_conversations; v_recipient uuid;
begin
  select * into v_conversation from public.rocket_conversations where id=new.conversation_id;
  v_recipient:=case when new.sender_id=v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.conversation_id::text || v_recipient::text,0));
  if not exists(select 1 from public.rocket_user_blocks b where (b.blocker_id=v_recipient and b.blocked_id=new.sender_id)
      or (b.blocker_id=new.sender_id and b.blocked_id=v_recipient))
    and coalesce((select enabled from public.rocket_inbox_email_preferences where user_id=v_recipient),true)
    and not exists(select 1 from inbox_private.email_queue q where q.conversation_id=new.conversation_id
      and q.recipient_id=v_recipient and q.created_at>now()-interval '15 minutes') then
    insert into inbox_private.email_queue(message_id,conversation_id,recipient_id,sender_id)
      values(new.id,new.conversation_id,v_recipient,new.sender_id) on conflict do nothing;
    perform inbox_private.dispatch_emails();
  end if;
  return new;
end $$;
revoke all on function inbox_private.queue_message_email() from public,anon,authenticated;
create trigger rocket_message_email after insert on public.rocket_messages
  for each row execute function inbox_private.queue_message_email();

create function public.lease_rocket_inbox_email(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q inbox_private.email_queue; v_email text; v_sender_name text; v_app_name text;
begin
  update inbox_private.email_queue set attempts=attempts+1,
    leased_until=now()+interval '5 minutes',
    available_at=now()+interval '5 minutes' * power(2,least(attempts,6))
  where id=p_id and dispatch_token=p_token and sent_at is null and attempts<8
    and available_at<=now() and (leased_until is null or leased_until<now())
    and created_at>now()-interval '7 days'
  returning * into q;
  if q.id is null then return null; end if;
  if not coalesce((select enabled from public.rocket_inbox_email_preferences where user_id=q.recipient_id),true)
    or exists(select 1 from public.rocket_user_blocks b where (b.blocker_id=q.recipient_id and b.blocked_id=q.sender_id)
      or (b.blocker_id=q.sender_id and b.blocked_id=q.recipient_id)) then
    update inbox_private.email_queue set sent_at=now(),leased_until=null,last_error='suppressed' where id=q.id;
    return null;
  end if;
  select email into v_email from auth.users where id=q.recipient_id and email_confirmed_at is not null and deleted_at is null;
  if v_email is null then
    update inbox_private.email_queue set sent_at=now(),leased_until=null,last_error='no verified recipient' where id=q.id;
    return null;
  end if;
  select coalesce(nullif(btrim(full_name),''),'Rocket member') into v_sender_name
    from public.member_public_profiles where user_id=q.sender_id;
  select a.name into v_app_name from public.rocket_conversations c join app_graph.apps a on a.id=c.app_id
    where c.id=q.conversation_id;
  return jsonb_build_object('id',q.id,'recipient',v_email,'sender_name',coalesce(v_sender_name,'Rocket member'),
    'app_name',coalesce(v_app_name,'an app'),'conversation_id',q.conversation_id);
end $$;
revoke all on function public.lease_rocket_inbox_email(uuid,text) from public,anon,authenticated;
grant execute on function public.lease_rocket_inbox_email(uuid,text) to service_role;

create function public.finish_rocket_inbox_email(p_id uuid,p_token text,p_resend_id text,p_error text) returns void
language sql security definer set search_path = '' as $$
  update inbox_private.email_queue set sent_at=case when p_resend_id is not null then now() else null end,
    resend_id=p_resend_id,leased_until=null,last_error=left(p_error,100)
  where id=p_id and dispatch_token=p_token and sent_at is null;
$$;
revoke all on function public.finish_rocket_inbox_email(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_rocket_inbox_email(uuid,text,text,text) to service_role;

create function public.rocket_admin_acquisition_metrics() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_rocket_admin() then jsonb_build_object(
    'approved_listings',(select count(*) from public.rocket_acquisition_listings where status<>'not_for_sale' and review_status='approved'),
    'pending_listings',(select count(*) from public.rocket_acquisition_listings where status<>'not_for_sale' and review_status='pending'),
    'conversations',(select count(*) from public.rocket_conversations),
    'messages_sent',(select count(*) from public.rocket_messages),
    'email_notifications_delivered',(select count(*) from inbox_private.email_queue where sent_at is not null and resend_id is not null)
  ) else '{}'::jsonb end;
$$;
revoke all on function public.rocket_admin_acquisition_metrics() from public,anon;
grant execute on function public.rocket_admin_acquisition_metrics() to authenticated;

-- Realtime applies participant RLS to Postgres change delivery.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rocket_messages') then
    alter publication supabase_realtime add table public.rocket_messages;
  end if;
end $$;
