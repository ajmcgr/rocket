create function public.rocket_admin_set_outreach_pause(p_paused boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  if not p_paused and not exists (
    select 1 from public.rocket_outreach_control
    where id=true and send_mode='production' and production_authorized=true
  ) then
    raise exception 'Production outreach is not authorized' using errcode='42501';
  end if;
  update public.rocket_outreach_control set paused=p_paused,updated_at=now() where id=true;
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id)
    values(auth.uid(),case when p_paused then 'pause_outreach' else 'resume_outreach' end,
      'outreach','campaign');
  return true;
end;
$$;
revoke all on function public.rocket_admin_set_outreach_pause(boolean) from public,anon;
grant execute on function public.rocket_admin_set_outreach_pause(boolean) to authenticated;
