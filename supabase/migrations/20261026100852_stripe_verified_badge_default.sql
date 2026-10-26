-- Preserve every existing visibility choice, including Private. Only future
-- connections start with a pending badge-only default.
alter table public.app_revenue_bindings add column visibility_configured boolean not null default true;
alter table public.app_revenue_bindings alter column visibility_configured set default false;

create function public.apply_default_stripe_revenue_visibility(
 p_app_id uuid,p_user_id uuid,p_expected_version integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_binding public.app_revenue_bindings; v_eligible boolean; v_selected boolean;
begin
 select * into v_binding from public.app_revenue_bindings
   where app_id=p_app_id and owner_user_id=p_user_id for update;
 if v_binding.app_id is null or v_binding.visibility_configured or v_binding.visibility<>'private'
   or v_binding.mapping_version<>p_expected_version then return false; end if;
 if not exists(select 1 from public.app_owners o where o.app_id=p_app_id and o.user_id=p_user_id
   and o.revoked_at is null and o.verification_level='domain_verified')
   or not exists(select 1 from public.app_revenue_connections c where c.id=v_binding.connection_id
     and c.owner_user_id=p_user_id and c.status='active' and c.livemode
     and c.last_successful_sync>now()-interval '72 hours') then return false; end if;
 select coalesce(bool_and(p.verification_status='verified' and p.source_livemode
   and p.observed_at>now()-interval '72 hours'),false) into v_eligible from (
   select distinct on(q.currency) q.verification_status,q.source_livemode,q.observed_at
   from public.app_revenue_metric_points q where q.app_id=p_app_id
     and q.connection_id=v_binding.connection_id and q.mapping_version=p_expected_version
   order by q.currency,q.observed_at desc
 ) p;
 if not v_eligible then return false; end if;
 -- Select Stripe only when no other revenue provider was chosen. Do not touch
 -- analytics or override another owner's/provider's saved selection.
 insert into public.app_provider_selection(app_id,owner_user_id,revenue_provider)
 values(p_app_id,p_user_id,'stripe') on conflict(app_id) do update
   set revenue_provider='stripe',updated_at=now()
   where public.app_provider_selection.owner_user_id=p_user_id
     and (public.app_provider_selection.revenue_provider is null or public.app_provider_selection.revenue_provider='stripe')
 returning true into v_selected;
 if not coalesce(v_selected,false) then return false; end if;
 update public.app_revenue_bindings set visibility='verified_only',visibility_configured=true,updated_at=now()
   where app_id=p_app_id;
 perform public.refresh_app_revenue_projection(p_app_id);
 return true;
end;
$$;
revoke all on function public.apply_default_stripe_revenue_visibility(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.apply_default_stripe_revenue_visibility(uuid,uuid,integer) to service_role;
