-- Automatic qualification and atomic permanent numbers; no editorial review.
create function public.rocket100_join() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_number integer; v_existing rocket100_private.members%rowtype;
begin
  if v_user is null then raise exception 'Sign in to join' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(100100100);
  select * into v_existing from rocket100_private.members where user_id=v_user;
  if v_existing.user_id is not null then
    return jsonb_build_object('status',case when v_existing.revoked_at is null then 'awarded' else 'revoked' end,
      'founding_number',v_existing.founding_number);
  end if;
  -- Internal admin accounts cannot consume founding places. A production
  -- account and independently domain-verified public app are still required.
  if public.is_rocket_admin() then raise exception 'Internal accounts are ineligible' using errcode='42501'; end if;
  if not rocket100_private.qualified(v_user) then
    raise exception 'Complete your public profile and verify ownership of a discoverable app first' using errcode='22023';
  end if;
  select coalesce(max(founding_number),0)+1 into v_number from rocket100_private.members;
  if v_number>100 then return jsonb_build_object('status','full'); end if;
  insert into rocket100_private.members(user_id,founding_number) values(v_user,v_number);
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values(v_user,'system','You are one of the Rocket 100',
      'Founding Builder #'||lpad(v_number::text,3,'0')||'. Your permanent place is ready to share.',
      '/100','rocket100-award:'||v_user::text)
    on conflict(user_id,event_key) do nothing;
  perform rocket100_private.refresh_scores();
  return jsonb_build_object('status','awarded','founding_number',v_number);
end $$;

revoke all on function public.rocket100_join() from public,anon;

grant execute on function public.rocket100_join() to authenticated;

create function public.rocket100_my_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then '{}'::jsonb else jsonb_build_object(
    'qualified',rocket100_private.qualified(auth.uid()),
    'internal_account',public.is_rocket_admin(),
    'username',(select username from public.member_public_profiles where user_id=auth.uid()),
    'profile_complete',exists(select 1 from public.member_public_profiles p where p.user_id=auth.uid()
      and length(btrim(p.full_name))>=2 and length(btrim(p.bio))>=10 and length(btrim(p.avatar_url))>0),
    'eligible_app_count',(select count(*) from rocket100_private.eligible_apps(auth.uid())),
    'owned_app_count',(select count(*) from public.app_owners o where o.user_id=auth.uid() and o.revoked_at is null),
    'founding_number',(select founding_number from rocket100_private.members where user_id=auth.uid() and revoked_at is null),
    'revoked',exists(select 1 from rocket100_private.members where user_id=auth.uid() and revoked_at is not null)
  ) end;
$$;

revoke all on function public.rocket100_my_status() from public,anon;

grant execute on function public.rocket100_my_status() to authenticated;

create function public.rocket100_admin_revoke(p_user_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_existing rocket100_private.members%rowtype;
begin
  if auth.uid() is null or not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(100100100);
  select * into v_existing from rocket100_private.members where user_id=p_user_id;
  if v_existing.user_id is null or v_existing.revoked_at is not null or length(btrim(p_reason))<10 then
    raise exception 'A current member and a documented reason are required' using errcode='22023';
  end if;
  update rocket100_private.members set revoked_at=now(),revocation_reason=left(p_reason,1000) where user_id=p_user_id;
  perform rocket100_private.refresh_scores();
  return jsonb_build_object('status','revoked','founding_number',v_existing.founding_number);
end $$;

revoke all on function public.rocket100_admin_revoke(uuid,text) from public,anon;

grant execute on function public.rocket100_admin_revoke(uuid,text) to authenticated;
