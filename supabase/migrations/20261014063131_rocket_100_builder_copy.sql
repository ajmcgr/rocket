-- Keep Rocket 100 terminology consistent in future and existing award notifications.
-- Eligibility, atomic numbering, and ranking behavior are unchanged.
create or replace function public.rocket100_join() returns jsonb
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
  if not rocket100_private.qualified(v_user) then
    raise exception 'Complete your public profile and verify ownership of a discoverable app first' using errcode='22023';
  end if;
  select coalesce(max(founding_number),0)+1 into v_number from rocket100_private.members;
  if v_number>100 then return jsonb_build_object('status','full'); end if;
  insert into rocket100_private.members(user_id,founding_number) values(v_user,v_number);
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values(v_user,'system','You are one of the Rocket 100',
      'Rocket 100 member #'||lpad(v_number::text,3,'0')||'. Your permanent place is ready to share.',
      '/100','rocket100-award:'||v_user::text)
    on conflict(user_id,event_key) do nothing;
  perform rocket100_private.refresh_scores();
  return jsonb_build_object('status','awarded','founding_number',v_number);
end $$;

revoke all on function public.rocket100_join() from public,anon;
grant execute on function public.rocket100_join() to authenticated;

update public.account_notifications
set body = regexp_replace(body, '^Founding Builder #', 'Rocket 100 member #')
where event_key like 'rocket100-award:%'
  and body like 'Founding Builder #%';
