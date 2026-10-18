-- Allow the existing privileged backend to run the same invitation workflow.
-- No access is granted to anonymous users or ordinary member accounts.
create or replace function public.rocket_admin_issue_claim_invitation(p_queue_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_queue public.rocket_outreach_queue%rowtype;
  v_claim_token text;
  v_unsubscribe_token text;
begin
  if not public.is_rocket_admin() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  if auth.role()='service_role' and not exists(select 1 from public.rocket_outreach_control where id=true and send_mode='production' and production_authorized and not paused) then
    raise exception 'Production outreach is paused or unauthorized' using errcode='42501';
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
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(coalesce(auth.uid(),(select id from auth.users where lower(email)='alex@alexmacgregor.com' and email_confirmed_at is not null and deleted_at is null)),
      'issue_claim_invitation','outreach',p_queue_id::text,jsonb_build_object('scheduled',auth.role()='service_role'));
  return jsonb_build_object('claim_token',v_claim_token,
    'unsubscribe_token',v_unsubscribe_token,
    'app_id',v_queue.app_id,'expires_at',now()+interval '7 days');
end;
$$;
revoke all on function public.rocket_admin_issue_claim_invitation(uuid)
  from public,anon;
grant execute on function public.rocket_admin_issue_claim_invitation(uuid)
  to authenticated;

create or replace function public.rocket_admin_outreach_first_batch()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_rocket_admin() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select distinct on (lower(btrim(q.recipient_email)))
      q.id,q.app_id,a.name as app_name,q.recipient_email,q.launch_product_id
    from public.rocket_outreach_queue q
    join app_graph.apps a on a.id=q.app_id and a.is_public=true
    join public.rocket_outreach_recipient_reviews r
      on r.email=lower(btrim(q.recipient_email)) and r.status='eligible'
    where q.status='eligible' and q.sent_at is null
      and not exists(select 1 from public.rocket_outreach_suppressions s where s.email=r.email)
      and not exists(select 1 from public.rocket_outreach_send_attempts t
        join public.rocket_outreach_queue previous on previous.id=t.queue_id
        where lower(btrim(previous.recipient_email))=r.email)
      and not exists(select 1 from public.app_owners o
        where o.app_id=q.app_id and o.revoked_at is null)
      and exists(select 1 from app_graph.app_sources s
        where s.app_id=q.app_id and s.external_id=q.launch_product_id
          and s.source_type='launch' and s.status='active' and s.match_state='attached')
    order by lower(btrim(q.recipient_email)),q.created_at,q.id
    limit 100
  ) x;
  return v_result;
end;
$$;
revoke all on function public.rocket_admin_outreach_first_batch() from public,anon;
grant execute on function public.rocket_admin_outreach_first_batch() to authenticated;

grant execute on function public.rocket_admin_issue_claim_invitation(uuid) to service_role;
grant execute on function public.rocket_admin_outreach_first_batch() to service_role;
