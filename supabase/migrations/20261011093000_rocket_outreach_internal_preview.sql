-- Only the explicitly allowlisted internal addresses appear here.
create function public.rocket_admin_outreach_test_candidates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_rocket_admin() then
    raise exception 'Admin access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
    select q.id,q.app_id,a.name as app_name,q.recipient_email,q.launch_product_id
    from public.rocket_outreach_queue q
    join app_graph.apps a on a.id=q.app_id and a.is_public=true
    join public.rocket_outreach_test_recipients t on t.email=lower(q.recipient_email)
    where q.status='eligible' and q.sent_at is null
      and not exists(select 1 from public.rocket_outreach_suppressions s
        where s.email=lower(q.recipient_email))
      and not exists(select 1 from public.rocket_outreach_send_attempts x
        where x.queue_id=q.id)
      and not exists(select 1 from public.app_owners o
        where o.app_id=q.app_id and o.revoked_at is null)
      and exists(select 1 from app_graph.app_sources s
        where s.app_id=q.app_id and s.external_id=q.launch_product_id
          and s.source_type='launch' and s.status='active' and s.match_state='attached')
    order by a.name,q.id limit 20
  ) x;
  return v_result;
end;
$$;
revoke all on function public.rocket_admin_outreach_test_candidates() from public,anon;
grant execute on function public.rocket_admin_outreach_test_candidates() to authenticated;
