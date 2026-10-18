-- Admin decisions do not require a written note. Preserve admin authorization,
-- eligible claim methods, active-owner protection, claimed-only level, and auditing.
create or replace function public.rocket_admin_action(p_action text,p_target uuid,p_reason text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_app uuid; v_status text;
begin
  if not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_reason is not null and length(p_reason)>1000 then raise exception 'Reason too long'; end if;
  if p_action in ('feature','unfeature','hide_app','restore_app') then
    select id into v_app from app_graph.apps where id=p_target for update;
    if v_app is null then raise exception 'Unknown app'; end if;
  end if;
  case p_action
    when 'feature' then
      if not exists(select 1 from public.public_discoverable_apps where id=p_target) then raise exception 'App is not discoverable'; end if;
      insert into public.rocket_editorial_picks(app_id,editor_user_id,status,placement,headline,editorial_note)
        values(p_target,v_user,'featured',coalesce(nullif(p_payload->>'placement',''),'standard'),
          left(nullif(p_payload->>'headline',''),160),left(nullif(p_payload->>'note',''),1000));
    when 'unfeature' then
      update public.rocket_editorial_picks set status='unfeatured',unfeatured_at=now()
        where app_id=p_target and status='featured';
      if not found then raise exception 'App is not featured'; end if;
    when 'hide_app' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'An objective reason is required'; end if;
      if exists(select 1 from public.app_owners where app_id=p_target and revoked_at is null) then
        raise exception 'Claimed app moderation requires a separate ownership review';
      end if;
      update app_graph.apps set is_public=false,updated_at=now() where id=p_target;
    when 'restore_app' then
      update app_graph.apps set is_public=true,updated_at=now() where id=p_target;
    when 'reject_claim' then
      p_reason := coalesce(nullif(trim(p_reason),''),'Rejected by administrator.');
      update public.app_claims set status='rejected',rejected_at=now(),review_reason=p_reason
        where id=p_target and status in ('pending','review');
      if not found then raise exception 'Claim is not pending review'; end if;
    when 'approve_claim' then
      p_reason := coalesce(nullif(trim(p_reason),''),'Approved by administrator.');
      select c.app_id into v_app from public.app_claims c
        where c.id=p_target and c.status in ('pending','review')
          and c.method in ('manual_review','existing_relationship') for update;
      if v_app is null then raise exception 'Claim is not eligible for manual approval'; end if;
      if exists(select 1 from public.app_owners o where o.app_id=v_app and o.revoked_at is null) then
        raise exception 'An active owner already exists; do not overwrite ownership';
      end if;
      insert into public.app_owners(app_id,user_id,claim_id,verification_level)
        select c.app_id,c.user_id,c.id,'claimed' from public.app_claims c where c.id=p_target;
      update public.app_claims set status='verified',verification_state='credible',
        completed_at=now(),review_reason=p_reason where id=p_target;
      update app_graph.apps set claim_state='claimed',updated_at=now() where id=v_app;
    when 'request_claim_correction' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Correction instructions are required'; end if;
      update public.app_claims set status='review',review_reason=p_reason
        where id=p_target and status in ('pending','review');
      if not found then raise exception 'Claim is not pending review'; end if;
    when 'hide_review' then
      if length(trim(coalesce(p_reason,'')))<10 then raise exception 'A moderation reason is required'; end if;
      update app_graph.app_reviews set status='hidden' where id=p_target and status='published';
      if not found then raise exception 'Review is not published'; end if;
    when 'restore_review' then
      update app_graph.app_reviews set status='published' where id=p_target and status='hidden';
      if not found then raise exception 'Review is not hidden'; end if;
    when 'pause_outreach' then
      update public.rocket_outreach_control set paused=true,updated_at=now() where id=true;
    when 'skip_outreach' then
      update public.rocket_outreach_queue set status='skipped',updated_at=now()
        where id=p_target and status in ('eligible','queued');
      if not found then raise exception 'Outreach item is not eligible'; end if;
    else raise exception 'Unsupported admin action';
  end case;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(v_user,p_action,case when p_action like '%claim%' then 'claim' when p_action like '%review%' then 'review'
      when p_action like '%outreach%' then 'outreach' else 'app' end,
      coalesce(p_target::text,'control'),jsonb_build_object('reason',p_reason,'payload',p_payload));
  return jsonb_build_object('ok',true,'action',p_action,'target',p_target);
end;
$$;
revoke all on function public.rocket_admin_action(text,uuid,text,jsonb) from public, anon;
grant execute on function public.rocket_admin_action(text,uuid,text,jsonb) to authenticated;
