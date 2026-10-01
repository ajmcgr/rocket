-- Founder delivery remains test-only. The allowlist starts empty by design.
create table public.rocket_outreach_test_recipients (
  email text primary key,
  approved_at timestamptz not null default now()
);
alter table public.rocket_outreach_test_recipients enable row level security;
revoke all on public.rocket_outreach_test_recipients from public, anon, authenticated;
grant all on public.rocket_outreach_test_recipients to service_role;

create table public.rocket_outreach_send_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null unique references public.rocket_outreach_queue(id),
  idempotency_key uuid not null unique default gen_random_uuid(),
  provider_email_id text unique,
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  reserved_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  last_error text
);
alter table public.rocket_outreach_send_attempts enable row level security;
revoke all on public.rocket_outreach_send_attempts from public, anon, authenticated;
grant all on public.rocket_outreach_send_attempts to service_role;

create function public.rocket_outreach_preserve_reserved_invitation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.invitation_token_hash is not null
      and new.invitation_token_hash is distinct from old.invitation_token_hash
      and exists(select 1 from public.rocket_outreach_send_attempts a
        where a.queue_id=old.id) then
    raise exception 'Invitation has a delivery attempt and cannot be reissued';
  end if;
  return new;
end;
$$;
create trigger rocket_outreach_preserve_reserved_invitation
  before update of invitation_token_hash on public.rocket_outreach_queue
  for each row execute function public.rocket_outreach_preserve_reserved_invitation();

-- A reservation is permanent, even on timeout: manual investigation is safer
-- than an automatic retry that might send a second email.
create function public.rocket_outreach_reserve_test_send(p_queue_id uuid, p_claim_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_queue public.rocket_outreach_queue%rowtype;
  v_attempt public.rocket_outreach_send_attempts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service access only' using errcode='42501';
  end if;
  select * into v_queue from public.rocket_outreach_queue where id=p_queue_id for update;
  if not found or v_queue.status <> 'queued' or v_queue.sent_at is not null
      or v_queue.invitation_expires_at <= now()
      or v_queue.invitation_token_hash is distinct from
        encode(extensions.digest(coalesce(p_claim_token,''),'sha256'),'hex') then
    raise exception 'Invitation is not ready for test delivery' using errcode='42501';
  end if;
  if not exists(select 1 from public.rocket_outreach_control c
      where c.id=true and c.paused=true and c.send_mode='test')
      or not exists(select 1 from public.rocket_outreach_test_recipients t
        where t.email=lower(v_queue.recipient_email))
      or exists(select 1 from public.rocket_outreach_suppressions s
        where s.email=lower(v_queue.recipient_email)) then
    raise exception 'Test-only delivery gate closed' using errcode='42501';
  end if;
  insert into public.rocket_outreach_send_attempts(queue_id) values(p_queue_id)
    returning * into v_attempt;
  return jsonb_build_object('attempt_id',v_attempt.id,
    'idempotency_key',v_attempt.idempotency_key,
    'recipient_email',v_queue.recipient_email,
    'founder_first_name',v_queue.founder_first_name,
    'app_id',v_queue.app_id);
end;
$$;
revoke all on function public.rocket_outreach_reserve_test_send(uuid,text) from public,anon,authenticated;
grant execute on function public.rocket_outreach_reserve_test_send(uuid,text) to service_role;

create function public.rocket_outreach_finish_test_send(p_attempt_id uuid,
  p_provider_email_id text, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempt public.rocket_outreach_send_attempts%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service access only' using errcode='42501';
  end if;
  select * into v_attempt from public.rocket_outreach_send_attempts
    where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'reserved' then
    raise exception 'Attempt already finalized';
  end if;
  if p_provider_email_id is not null then
    update public.rocket_outreach_send_attempts set status='sent',
      provider_email_id=p_provider_email_id,provider_accepted_at=now()
      where id=p_attempt_id;
    update public.rocket_outreach_queue set status='sent',sent_at=now(),updated_at=now()
      where id=v_attempt.queue_id and status='queued';
  else
    update public.rocket_outreach_send_attempts set status='failed',last_error=left(p_error,500)
      where id=p_attempt_id;
    update public.rocket_outreach_queue set status='failed',last_error=left(p_error,500),updated_at=now()
      where id=v_attempt.queue_id and status='queued';
  end if;
  return true;
end;
$$;
revoke all on function public.rocket_outreach_finish_test_send(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rocket_outreach_finish_test_send(uuid,text,text) to service_role;

-- Idempotent provider events only apply to a known outreach send attempt.
create function public.rocket_outreach_record_resend_event(p_provider_email_id text,
  p_provider_event_id text,p_event_type text,p_occurred_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempt public.rocket_outreach_send_attempts%rowtype;
  v_email text;
  v_event text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service access only' using errcode='42501';
  end if;
  v_event := case p_event_type
    when 'email.delivered' then 'delivered'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.opened' then 'opened'
    when 'email.clicked' then 'clicked'
    else null end;
  if v_event is null or p_provider_event_id is null then return false; end if;
  select * into v_attempt from public.rocket_outreach_send_attempts
    where provider_email_id=p_provider_email_id for update;
  if not found then return false; end if;
  insert into public.rocket_outreach_events(queue_id,event_type,provider_event_id,occurred_at)
    values(v_attempt.queue_id,v_event,p_provider_event_id,coalesce(p_occurred_at,now()))
    on conflict (provider_event_id) do nothing;
  if not found then return true; end if;
  select lower(recipient_email) into v_email from public.rocket_outreach_queue
    where id=v_attempt.queue_id for update;
  if v_event in ('bounced','complained') then
    insert into public.rocket_outreach_suppressions(email,reason)
      values(v_email,v_event) on conflict (email) do nothing;
    update public.rocket_outreach_queue set status=case
      when status in ('claimed','verified','connected') then status
      when v_event='bounced' then 'bounced' else 'suppressed' end,
      last_event_at=coalesce(p_occurred_at,now()),updated_at=now()
      where recipient_email=v_email;
  elsif v_event='delivered' then
    update public.rocket_outreach_queue set status='delivered',
      last_event_at=coalesce(p_occurred_at,now()),updated_at=now()
      where id=v_attempt.queue_id and status='sent';
  elsif v_event='clicked' then
    update public.rocket_outreach_queue set status='clicked',
      last_event_at=coalesce(p_occurred_at,now()),updated_at=now()
      where id=v_attempt.queue_id and status in ('sent','delivered');
  else
    update public.rocket_outreach_queue set last_event_at=coalesce(p_occurred_at,now()),updated_at=now()
      where id=v_attempt.queue_id;
  end if;
  return true;
end;
$$;
revoke all on function public.rocket_outreach_record_resend_event(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.rocket_outreach_record_resend_event(text,text,text,timestamptz) to service_role;

-- Read-only preview of the next 25 eligible founders. This is not a sender.
create function public.rocket_admin_outreach_today()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select q.id,q.app_id,a.name as app_name,q.recipient_email,
      q.founder_first_name,q.launch_product_id,q.status,q.created_at
    from public.rocket_outreach_queue q
    join app_graph.apps a on a.id=q.app_id
    where q.status in ('eligible','queued') and q.sent_at is null
      and a.is_public=true
      and not exists(select 1 from public.app_owners o
        where o.app_id=q.app_id and o.revoked_at is null)
      and not exists(select 1 from public.rocket_outreach_suppressions s
        where s.email=lower(q.recipient_email))
      and exists(select 1 from app_graph.app_sources s
        where s.app_id=q.app_id and s.external_id=q.launch_product_id
          and s.source_type='launch' and s.status='active' and s.match_state='attached')
    order by q.created_at,q.id limit 25
  ) x;
  return v_result;
end;
$$;
revoke all on function public.rocket_admin_outreach_today() from public,anon;
grant execute on function public.rocket_admin_outreach_today() to authenticated;
