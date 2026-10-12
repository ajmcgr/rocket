-- Public projection and admin read-only evidence; no private metrics exposed.
create function public.get_rocket100_leaderboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('participants',(select count(*) from rocket100_private.members),
    'calculated_at',(select max(calculated_at) from rocket100_private.scores),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'username',p.username,'name',p.full_name,'avatar_url',p.avatar_url,
      'founding_number',m.founding_number,'awarded_at',m.awarded_at,
      'rank',s.rank_position,'score',s.score,'popularity',s.popularity_score,
      'app_count',s.eligible_app_count) order by s.rank_position)
      from rocket100_private.members m join public.member_public_profiles p on p.user_id=m.user_id
      left join rocket100_private.scores s on s.user_id=m.user_id
      where m.revoked_at is null),'[]'::jsonb));
$$;

revoke all on function public.get_rocket100_leaderboard() from public;

grant execute on function public.get_rocket100_leaderboard() to anon,authenticated,service_role;

create function public.rocket100_admin_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_rocket_admin() then raise exception 'Admin access denied' using errcode='42501'; end if;
  return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,'awarded_at',m.awarded_at,'revocation_reason',m.revocation_reason,
    'username',p.username,'name',p.full_name,'avatar_url',p.avatar_url,'bio',p.bio,
    'verified_apps',(select jsonb_agg(jsonb_build_object('id',v.app_id,'name',x.name)) from rocket100_private.eligible_apps(m.user_id) v join public.public_discoverable_apps x on x.id=v.app_id),
    'qualified',rocket100_private.qualified(m.user_id),
    'founding_number',m.founding_number,'revoked_at',m.revoked_at,'rank',s.rank_position,'score',s.score
  ) order by m.founding_number) from rocket100_private.members m
  left join public.member_public_profiles p on p.user_id=m.user_id
  left join rocket100_private.scores s on s.user_id=m.user_id),'[]'::jsonb));
end $$;

revoke all on function public.rocket100_admin_snapshot() from public,anon;

grant execute on function public.rocket100_admin_snapshot() to authenticated;

notify pgrst, 'reload schema';
