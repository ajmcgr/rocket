-- Exactly one external traffic source and one external revenue source per app.
-- These choices do not change Buy with Rocket's merchant or billing ledger.
create table public.app_provider_selection (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  analytics_provider text check (analytics_provider in ('ga4', 'posthog')),
  revenue_provider text check (revenue_provider in ('stripe', 'revenuecat', 'polar', 'dodo')),
  updated_at timestamptz not null default now()
);
alter table public.app_provider_selection enable row level security;
revoke all on public.app_provider_selection from public, anon, authenticated;
grant all on public.app_provider_selection to service_role;

-- Preserve the source of previously verified, already permissioned evidence.
insert into public.app_provider_selection (app_id, owner_user_id, analytics_provider)
select distinct on (c.app_id) c.app_id, c.owner_user_id, c.provider
from public.app_data_connections c
join public.app_owners o on o.app_id = c.app_id and o.user_id = c.owner_user_id
  and o.revoked_at is null and o.verification_level = 'domain_verified'
where c.status = 'active' and c.provider in ('ga4', 'posthog')
order by c.app_id, c.last_successful_sync desc nulls last
on conflict (app_id) do nothing;

insert into public.app_provider_selection (app_id, owner_user_id, revenue_provider)
select b.app_id, b.owner_user_id, 'stripe'
from public.app_revenue_bindings b
join public.app_owners o on o.app_id = b.app_id and o.user_id = b.owner_user_id
  and o.revoked_at is null and o.verification_level = 'domain_verified'
on conflict (app_id) do update set revenue_provider = 'stripe';

-- Service-only, atomic switch. Clearing stale public projections prevents an
-- old provider's data from surviving a source change. It never touches orders.
create function public.set_app_provider_selection(
  p_app_id uuid, p_owner_user_id uuid, p_kind text, p_provider text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_previous text;
begin
  if p_kind not in ('analytics', 'revenue') then raise exception 'Invalid provider kind'; end if;
  if p_kind = 'analytics' and p_provider is not null
    and p_provider not in ('ga4', 'posthog') then raise exception 'Invalid analytics provider'; end if;
  if p_kind = 'revenue' and p_provider is not null
    and p_provider not in ('stripe', 'revenuecat', 'polar', 'dodo') then raise exception 'Invalid revenue provider'; end if;
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_owner_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select case when p_kind = 'analytics' then s.analytics_provider else s.revenue_provider end
    into v_previous from public.app_provider_selection s where s.app_id = p_app_id;
  insert into public.app_provider_selection(app_id, owner_user_id, analytics_provider, revenue_provider)
  values(p_app_id, p_owner_user_id,
    case when p_kind = 'analytics' then p_provider end,
    case when p_kind = 'revenue' then p_provider end)
  on conflict (app_id) do update set
    owner_user_id = excluded.owner_user_id,
    analytics_provider = case when p_kind = 'analytics' then p_provider else public.app_provider_selection.analytics_provider end,
    revenue_provider = case when p_kind = 'revenue' then p_provider else public.app_provider_selection.revenue_provider end,
    updated_at = now();
  if v_previous is distinct from p_provider then
    if p_kind = 'analytics' then
      delete from public.public_app_traction where app_id = p_app_id;
    else
      delete from public.public_app_revenue where app_id = p_app_id;
    end if;
  end if;
end;
$$;
revoke all on function public.set_app_provider_selection(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.set_app_provider_selection(uuid,uuid,text,text) to service_role;

-- Public reads fail closed if the app owner changes the authoritative source.
create or replace function public.app_traction_is_currently_public(
  p_app_id uuid, p_metric_type text, p_visibility text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_metric_visibility v
    join public.app_data_connections c on c.app_id = v.app_id and c.provider = 'ga4'
    join public.app_provider_selection s on s.app_id = v.app_id
      and s.owner_user_id = c.owner_user_id and s.analytics_provider = c.provider
    join public.app_owners o on o.app_id = v.app_id
    where v.app_id = p_app_id and v.metric_type = p_metric_type
      and v.visibility = p_visibility and v.visibility <> 'private'
      and c.status = 'active' and c.last_successful_sync > now() - interval '72 hours'
      and o.revoked_at is null and o.user_id = c.owner_user_id
      and o.verification_level = 'domain_verified'
  );
$$;

create or replace function public.app_revenue_is_currently_public(
  p_app_id uuid, p_currency text, p_visibility text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_revenue_bindings b
    join public.app_revenue_connections c on c.id = b.connection_id
    join public.app_provider_selection s on s.app_id = b.app_id
      and s.owner_user_id = b.owner_user_id and s.revenue_provider = c.provider
    join public.app_owners o on o.app_id = b.app_id
    where b.app_id = p_app_id and b.visibility = p_visibility and b.visibility <> 'private'
      and c.provider = 'stripe' and c.status = 'active' and c.livemode
      and c.last_successful_sync > now() - interval '72 hours'
      and o.user_id = b.owner_user_id and o.revoked_at is null
      and o.verification_level = 'domain_verified'
      and exists (select 1 from public.app_stripe_price_mappings m
        where m.app_id = b.app_id and m.connection_id = c.id and m.currency = p_currency)
  );
$$;

-- An ownership transfer also invalidates selections; no new owner inherits
-- permission to publish the prior owner's third-party data.
create function public.clear_app_provider_selection_on_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.user_id is distinct from old.user_id
    or new.revoked_at is not null then
    delete from public.app_provider_selection
      where app_id = old.app_id and owner_user_id = old.user_id;
    delete from public.public_app_traction where app_id = old.app_id;
    delete from public.public_app_revenue where app_id = old.app_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.clear_app_provider_selection_on_owner_change() from public, anon, authenticated;
create trigger clear_provider_selection_when_owner_changes
  after update or delete on public.app_owners
  for each row execute function public.clear_app_provider_selection_on_owner_change();
