-- Public trust is a factual projection of already-public, RLS-protected evidence.
-- It contains no owner identity, claim challenge, provider ID, or private metric.
-- Keep the public claim state aligned with the active owner, including revocation.
-- Only the service role can mutate app_owners; the trigger does not grant callers
-- any new access to app_graph.apps.
create function app_graph.sync_app_claim_state_from_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_app_id uuid;
  v_state text;
begin
  v_app_id := case when tg_op = 'DELETE' then old.app_id else new.app_id end;
  v_state := case
    when tg_op = 'DELETE' then 'unclaimed'
    when new.revoked_at is not null then 'unclaimed'
    else new.verification_level
  end;
  update app_graph.apps set claim_state = v_state, updated_at = now()
    where id = v_app_id and claim_state is distinct from v_state;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_graph.sync_app_claim_state_from_owner() from public, anon, authenticated;
create trigger sync_app_claim_state_from_owner
  after insert or update or delete on public.app_owners
  for each row execute function app_graph.sync_app_claim_state_from_owner();

create view public.public_app_trust with (security_invoker = true) as
select a.id as app_id,
  a.claim_state in ('claimed', 'domain_verified') as claimed,
  a.claim_state = 'domain_verified' as domain_verified,
  exists (
    select 1 from public.public_app_traction t where t.app_id = a.id
  ) as traffic_verified,
  exists (
    select 1 from public.public_app_revenue r where r.app_id = a.id
  ) as revenue_verified
from public.public_apps a;

revoke all on public.public_app_trust from public, anon, authenticated;
grant select on public.public_app_trust to anon, authenticated;

-- Public visibility is not permission to use a metric in Rocket marketing.
-- These owner-private, service-role-managed flags are deliberately default-off.
alter table public.app_metric_visibility
  add column external_marketing_allowed boolean not null default false;
alter table public.app_revenue_bindings
  add column external_marketing_allowed boolean not null default false;

comment on column public.app_metric_visibility.external_marketing_allowed is
  'Separate permission for external Rocket editorial/social use; public metric visibility alone does not grant it.';
comment on column public.app_revenue_bindings.external_marketing_allowed is
  'Separate permission for external Rocket editorial/social use; public metric visibility alone does not grant it.';
