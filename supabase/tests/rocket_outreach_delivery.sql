-- Rollback-only delivery gates and event handling. No Resend request occurs.
begin;
do $$
declare
  v_admin uuid;
  v_source public.rocket_outreach_queue%rowtype;
  v_id uuid;
  v_issue jsonb;
  v_reserved jsonb;
  v_denied boolean;
begin
  select id into strict v_admin from auth.users
    where lower(email)='alex@alexmacgregor.com'
      and email_confirmed_at is not null and deleted_at is null;
  select * into strict v_source from public.rocket_outreach_queue
    where status='eligible' order by id limit 1;
  insert into public.rocket_outreach_queue
    (app_id,launch_product_id,recipient_email,founder_user_id,status)
    values(v_source.app_id,v_source.launch_product_id,'alex@alexmacgregor.com',
      v_source.founder_user_id,'eligible') returning id into v_id;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_issue := public.rocket_admin_issue_claim_invitation(v_id);
  perform set_config('request.jwt.claim.role','service_role',true);
  v_denied := false;
  begin
    perform public.rocket_outreach_reserve_test_send(v_id,v_issue->>'claim_token');
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Empty test-recipient allowlist failed open'; end if;
  insert into public.rocket_outreach_test_recipients(email)
    values('alex@alexmacgregor.com');
  v_reserved := public.rocket_outreach_reserve_test_send(v_id,v_issue->>'claim_token');
  if v_reserved->>'recipient_email'<>'alex@alexmacgregor.com' then
    raise exception 'Reservation recipient mismatch';
  end if;
  v_denied := false;
  begin
    perform public.rocket_outreach_reserve_test_send(v_id,v_issue->>'claim_token');
  exception when unique_violation then v_denied := true; end;
  if not v_denied then raise exception 'Duplicate reservation succeeded'; end if;
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_denied := false;
  begin
    perform public.rocket_admin_issue_claim_invitation(v_id);
  exception when others then v_denied := true; end;
  if not v_denied then raise exception 'Reserved invitation was reissued'; end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  perform public.rocket_outreach_finish_test_send(
    (v_reserved->>'attempt_id')::uuid,'synthetic-resend-id',null);
  if (select status from public.rocket_outreach_queue where id=v_id)<>'sent' then
    raise exception 'Accepted test send was not marked sent';
  end if;
  perform public.rocket_outreach_record_resend_event(
    'synthetic-resend-id','synthetic-event-1','email.delivered',now());
  perform public.rocket_outreach_record_resend_event(
    'synthetic-resend-id','synthetic-event-1','email.delivered',now());
  if (select status from public.rocket_outreach_queue where id=v_id)<>'delivered'
      or (select count(*) from public.rocket_outreach_events
          where queue_id=v_id and event_type='delivered')<>1 then
    raise exception 'Delivered event did not apply exactly once';
  end if;
  perform public.rocket_outreach_record_resend_event(
    'synthetic-resend-id','synthetic-event-2','email.clicked',now());
  if (select status from public.rocket_outreach_queue where id=v_id)<>'clicked' then
    raise exception 'Click was not tracked';
  end if;
  perform public.rocket_outreach_record_resend_event(
    'synthetic-resend-id','synthetic-event-3','email.bounced',now());
  if (select status from public.rocket_outreach_queue where id=v_id)<>'bounced'
      or not exists(select 1 from public.rocket_outreach_suppressions
          where email='alex@alexmacgregor.com' and reason='bounced') then
    raise exception 'Hard bounce did not suppress outreach';
  end if;
end;
$$;
select 'PASS: test-only gate, idempotency, reissue guard, events and bounce suppression' as result;
rollback;
