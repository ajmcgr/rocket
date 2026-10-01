-- Run with a privileged SQL connection. Every synthetic row, claim and audit
-- record is rolled back. This does not send email or alter a real app claim.
begin;
do $$
declare
  v_admin uuid;
  v_other uuid;
  v_source public.rocket_outreach_queue%rowtype;
  v_second public.rocket_outreach_queue%rowtype;
  v_test_id uuid;
  v_second_id uuid;
  v_issue jsonb;
  v_second_issue jsonb;
  v_result jsonb;
  v_denied boolean;
begin
  select id into strict v_admin from auth.users
    where lower(email)='alex@alexmacgregor.com'
      and email_confirmed_at is not null and deleted_at is null;
  select id into strict v_other from auth.users
    where id<>v_admin and email_confirmed_at is not null and deleted_at is null
    limit 1;
  select * into strict v_source from public.rocket_outreach_queue
    where status='eligible' order by id limit 1;
  select * into strict v_second from public.rocket_outreach_queue
    where status='eligible' and app_id<>v_source.app_id order by id limit 1;

  insert into public.rocket_outreach_queue
    (app_id,launch_product_id,recipient_email,founder_user_id,status)
    values(v_source.app_id,v_source.launch_product_id,'alex@alexmacgregor.com',
      v_source.founder_user_id,'eligible') returning id into v_test_id;
  insert into public.rocket_outreach_queue
    (app_id,launch_product_id,recipient_email,founder_user_id,status)
    values(v_second.app_id,v_second.launch_product_id,'alex@alexmacgregor.com',
      v_second.founder_user_id,'eligible') returning id into v_second_id;

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_issue := public.rocket_admin_issue_claim_invitation(v_test_id);

  v_denied := false;
  begin
    perform public.rocket_redeem_claim_invitation(v_issue->>'claim_token',v_second.app_id);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Wrong-app token was accepted'; end if;

  perform set_config('request.jwt.claim.sub',v_other::text,true);
  v_denied := false;
  begin
    perform public.rocket_redeem_claim_invitation(v_issue->>'claim_token',v_source.app_id);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Wrong-user token was accepted'; end if;

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_result := public.rocket_redeem_claim_invitation(v_issue->>'claim_token',v_source.app_id);
  if v_result->>'verification_level'<>'claimed' or not exists(
    select 1 from public.app_owners where app_id=v_source.app_id
      and user_id=v_admin and verification_level='claimed') then
    raise exception 'Valid invitation did not create a claimed-only owner';
  end if;

  v_denied := false;
  begin
    perform public.rocket_redeem_claim_invitation(v_issue->>'claim_token',v_source.app_id);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Used token was accepted'; end if;

  v_second_issue := public.rocket_admin_issue_claim_invitation(v_second_id);
  update public.rocket_outreach_queue set invitation_expires_at=now()-interval '1 second'
    where id=v_second_id;
  v_denied := false;
  begin
    perform public.rocket_redeem_claim_invitation(v_second_issue->>'claim_token',v_second.app_id);
  exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then raise exception 'Expired token was accepted'; end if;

  if length(v_issue->>'unsubscribe_token')<>64 then
    raise exception 'Unsubscribe token was not issued';
  end if;
  if not public.rocket_unsubscribe_founder_outreach(v_issue->>'unsubscribe_token') then
    raise exception 'Outreach-only unsubscribe returned false';
  end if;
  if not exists(select 1 from public.rocket_outreach_suppressions
        where email='alex@alexmacgregor.com' and reason='unsubscribed') then
    raise exception 'Outreach-only suppression was not recorded';
  end if;
  perform public.rocket_unsubscribe_founder_outreach(v_issue->>'unsubscribe_token');
  if (select count(*) from public.rocket_outreach_events
      where queue_id=v_test_id and event_type='unsubscribed')<>1 then
    raise exception 'Unsubscribe was not single-use';
  end if;
end;
$$;
select 'PASS: invitation authorization, binding, expiry, reuse, claim level and unsubscribe' as result;
rollback;
