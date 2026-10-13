-- Keep the ownership predicate outside the Data API's exposed public schema.
create function app_graph.agent_integrations_current(p_app_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_owners o
    join app_graph.apps a on a.id = o.app_id
    where o.app_id = p_app_id and o.user_id = p_user_id
      and o.revoked_at is null and o.verification_level = 'domain_verified'
      and a.is_public
  );
$$;
revoke all on function app_graph.agent_integrations_current(uuid,uuid) from public;
grant execute on function app_graph.agent_integrations_current(uuid,uuid) to anon, authenticated, service_role;
alter policy "Current verified owner agent links" on public.app_agent_integrations
  using (app_graph.agent_integrations_current(app_id, updated_by));
drop function public.agent_integrations_current(uuid,uuid);
