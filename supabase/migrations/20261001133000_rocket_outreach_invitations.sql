-- Opaque, single-use Launch founder invitations. No sending is enabled here.
alter table public.rocket_outreach_queue
  add column unsubscribe_token_hash text unique,
  add column unsubscribed_at timestamptz;

create table public.rocket_outreach_events (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.rocket_outreach_queue(id),
  event_type text not null check (event_type in
    ('invitation_issued','claimed','delivered','bounced','complained','opened','clicked','unsubscribed')),
  provider_event_id text unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index rocket_outreach_events_queue_idx
  on public.rocket_outreach_events(queue_id,occurred_at desc);
alter table public.rocket_outreach_events enable row level security;
revoke all on public.rocket_outreach_events from public, anon, authenticated;
grant all on public.rocket_outreach_events to service_role;

create function public.rocket_admin_issue_claim_invitation(p_queue_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_queue public.rocket_outreach_queue%rowtype;
  v_claim_token text;
  v_unsubscribe_token text;
begin
  if not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  select * into v_queue from public.rocket_outreach_queue
    where id=p_queue_id for update;
  if not found then raise exception 'Unknown invitation'; end if;
  if v_queue.status not in ('eligible','queued') or v_queue.sent_at is not null then
    raise exception 'Invitation is not eligible';
  end if;
  if exists(select 1 from public.rocket_outreach_suppressions s
      where s.email=lower(v_queue.recipient_email)) then
    raise exception 'Recipient is suppressed';
  end if;
  if not exists(select 1 from app_graph.app_sources s
      where s.app_id=v_queue.app_id and s.external_id=v_queue.launch_product_id
        and s.source_type='launch' and s.status='active' and s.match_state='attached') then
    raise exception 'Launch relationship is no longer attached';
  end if;
  if exists(select 1 from public.app_owners o
      where o.app_id=v_queue.app_id and o.revoked_at is null) then
    raise exception 'App already claimed';
  end if;
  v_claim_token := encode(extensions.gen_random_bytes(32),'hex');
  v_unsubscribe_token := encode(extensions.gen_random_bytes(32),'hex');
  update public.rocket_outreach_queue set
    invitation_token_hash=encode(extensions.digest(v_claim_token,'sha256'),'hex'),
    invitation_expires_at=now()+interval '7 days',
    invitation_redeemed_at=null,
    unsubscribe_token_hash=encode(extensions.digest(v_unsubscribe_token,'sha256'),'hex'),
    status='queued',updated_at=now()
  where id=p_queue_id;
  insert into public.rocket_outreach_events(queue_id,event_type)
    values(p_queue_id,'invitation_issued');
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id)
    values(auth.uid(),'issue_claim_invitation','outreach',p_queue_id::text);
  return jsonb_build_object('claim_token',v_claim_token,
    'unsubscribe_token',v_unsubscribe_token,
    'app_id',v_queue.app_id,'expires_at',now()+interval '7 days');
end;
$$;
revoke all on function public.rocket_admin_issue_claim_invitation(uuid)
  from public,anon;
grant execute on function public.rocket_admin_issue_claim_invitation(uuid)
  to authenticated;

create function public.rocket_redeem_claim_invitation(p_token text,p_app_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user auth.users%rowtype;
  v_queue public.rocket_outreach_queue%rowtype;
  v_claim_id uuid;
begin
  if auth.uid() is null or length(coalesce(p_token,''))<>64
      or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode='42501';
  end if;
  select * into v_user from auth.users where id=auth.uid()
    and email_confirmed_at is not null and deleted_at is null;
  if not found then raise exception 'A confirmed account is required' using errcode='42501'; end if;
  select * into v_queue from public.rocket_outreach_queue
    where invitation_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    for update;
  if not found or v_queue.app_id<>p_app_id
      or v_queue.invitation_redeemed_at is not null
      or v_queue.invitation_expires_at<=now()
      or v_queue.status in ('skipped','bounced','suppressed','failed') then
    raise exception 'Invalid or expired invitation' using errcode='42501';
  end if;
  if lower(v_user.email)<>lower(v_queue.recipient_email) then
    raise exception 'Invitation belongs to another account' using errcode='42501';
  end if;
  if exists(select 1 from public.rocket_outreach_suppressions s
      where s.email=lower(v_queue.recipient_email)) then
    raise exception 'Recipient is suppressed' using errcode='42501';
  end if;
  perform 1 from app_graph.apps where id=p_app_id for update;
  if not exists(select 1 from app_graph.app_sources s
      where s.app_id=p_app_id and s.external_id=v_queue.launch_product_id
        and s.source_type='launch' and s.status='active' and s.match_state='attached')
      or exists(select 1 from public.app_owners o
        where o.app_id=p_app_id and o.revoked_at is null) then
    raise exception 'App is no longer eligible' using errcode='42501';
  end if;
  insert into public.app_claims(app_id,user_id,method,status,verification_state,
    completed_at,review_reason)
    values(p_app_id,v_user.id,'existing_relationship','verified','credible',now(),
      'Launch founder invitation; email bound to Launch product owner')
    returning id into v_claim_id;
  insert into public.app_owners(app_id,user_id,claim_id,verification_level)
    values(p_app_id,v_user.id,v_claim_id,'claimed');
  update app_graph.apps set claim_state='claimed',updated_at=now() where id=p_app_id;
  update public.rocket_outreach_queue set status='claimed',
    invitation_redeemed_at=now(),invitation_token_hash=null,updated_at=now()
    where id=v_queue.id;
  insert into public.rocket_outreach_events(queue_id,event_type)
    values(v_queue.id,'claimed');
  return jsonb_build_object('app_id',p_app_id,'claim_id',v_claim_id,
    'verification_level','claimed');
end;
$$;
revoke all on function public.rocket_redeem_claim_invitation(text,uuid)
  from public,anon;
grant execute on function public.rocket_redeem_claim_invitation(text,uuid)
  to authenticated;

-- Unsubscribe uses a separate opaque token and affects founder outreach only.
create function public.rocket_unsubscribe_founder_outreach(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_queue public.rocket_outreach_queue%rowtype;
begin
  if length(coalesce(p_token,''))<>64 or p_token !~ '^[0-9a-f]{64}$' then
    return true;
  end if;
  select * into v_queue from public.rocket_outreach_queue
    where unsubscribe_token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    for update;
  if not found then return true; end if;
  insert into public.rocket_outreach_suppressions(email,reason)
    values(lower(v_queue.recipient_email),'unsubscribed')
    on conflict (email) do nothing;
  update public.rocket_outreach_queue set
    status=case when status in ('claimed','verified','connected') then status else 'suppressed' end,
    unsubscribed_at=now(),unsubscribe_token_hash=null,updated_at=now()
    where recipient_email=lower(v_queue.recipient_email);
  insert into public.rocket_outreach_events(queue_id,event_type)
    values(v_queue.id,'unsubscribed');
  return true;
end;
$$;
revoke all on function public.rocket_unsubscribe_founder_outreach(text)
  from public;
grant execute on function public.rocket_unsubscribe_founder_outreach(text)
  to anon,authenticated;
