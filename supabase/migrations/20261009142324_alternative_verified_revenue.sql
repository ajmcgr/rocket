-- A single, service-only evidence contract for alternative revenue providers.
-- Stripe's existing revenue verification and Buy with Rocket ledgers are untouched.
create table public.app_verified_revenue_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('revenuecat', 'polar', 'dodo')),
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  access_token_ciphertext text,
  access_token_iv text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  access_token_expires_at timestamptz,
  last_attempted_sync timestamptz,
  last_successful_sync timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, provider),
  check (status = 'disconnected' or (access_token_ciphertext is not null and access_token_iv is not null))
);

create table public.app_verified_revenue_sources (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  connection_id uuid not null references public.app_verified_revenue_connections(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('revenuecat', 'polar', 'dodo')),
  external_account_id text not null,
  external_app_id text not null,
  product_ids text[] not null default '{}',
  mapping_version integer not null default 1 check (mapping_version > 0),
  visibility text not null default 'private' check (visibility in ('private', 'verified_only', 'range', 'exact')),
  last_attempted_sync timestamptz,
  last_successful_sync timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(product_ids) between 1 and 1000),
  unique(provider, external_account_id)
);
create index app_verified_revenue_sources_connection_idx
  on public.app_verified_revenue_sources(connection_id);

create table public.app_verified_revenue_points (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  connection_id uuid not null references public.app_verified_revenue_connections(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('revenuecat', 'polar', 'dodo')),
  external_account_id text not null,
  external_app_id text not null,
  product_ids text[] not null,
  mapping_version integer not null,
  metric_type text not null check (metric_type in ('gross_revenue_30d', 'subscription_mrr')),
  value_minor numeric(20,2) not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  observed_at timestamptz not null,
  verified_at timestamptz not null default now(),
  calculation_version integer not null,
  source_environment text not null check (source_environment in ('production', 'sandbox')),
  check (period_end is null or period_start <= period_end)
);
create index app_verified_revenue_points_latest_idx
  on public.app_verified_revenue_points(app_id, mapping_version, verified_at desc);

create table public.public_app_verified_revenue (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  provider text not null check (provider in ('revenuecat', 'polar', 'dodo')),
  metric_type text not null check (metric_type in ('gross_revenue_30d', 'subscription_mrr')),
  visibility text not null check (visibility in ('verified_only', 'range', 'exact')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  value_minor numeric(20,2),
  range_lower_minor numeric(20,2),
  range_upper_minor numeric(20,2),
  period_start date,
  period_end date,
  observed_at timestamptz not null,
  verified_at timestamptz not null,
  mapping_version integer not null,
  check ((visibility = 'exact' and value_minor is not null and range_lower_minor is null and range_upper_minor is null)
    or (visibility = 'range' and value_minor is null and range_lower_minor is not null)
    or (visibility = 'verified_only' and value_minor is null and range_lower_minor is null and range_upper_minor is null))
);

create table public.app_verified_revenue_oauth_states (
  state_hash text primary key,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verifier_ciphertext text not null,
  verifier_iv text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index app_verified_revenue_oauth_states_expiry_idx
  on public.app_verified_revenue_oauth_states(expires_at);

alter table public.app_verified_revenue_connections enable row level security;
alter table public.app_verified_revenue_sources enable row level security;
alter table public.app_verified_revenue_points enable row level security;
alter table public.public_app_verified_revenue enable row level security;
alter table public.app_verified_revenue_oauth_states enable row level security;
revoke all on public.app_verified_revenue_connections, public.app_verified_revenue_sources,
  public.app_verified_revenue_points, public.public_app_verified_revenue,
  public.app_verified_revenue_oauth_states from public, anon, authenticated;
grant all on public.app_verified_revenue_connections, public.app_verified_revenue_sources,
  public.app_verified_revenue_points, public.public_app_verified_revenue,
  public.app_verified_revenue_oauth_states to service_role;
grant select on public.public_app_verified_revenue to anon, authenticated;

-- Oldest due app sources first, with a per-source backoff. A single developer
-- may map several apps, so connection-wide timestamps cannot drive this queue.
create function public.due_app_verified_revenue_sources(p_provider text, p_limit integer)
returns table(app_id uuid, owner_user_id uuid, connection_id uuid)
language sql stable security invoker set search_path = '' as $$
  select s.app_id, s.owner_user_id, s.connection_id
  from public.app_verified_revenue_sources s
  join public.app_verified_revenue_connections c on c.id = s.connection_id
  where s.provider = p_provider and c.provider = s.provider
    and c.owner_user_id = s.owner_user_id and c.status <> 'disconnected'
    and (s.last_attempted_sync is null
      or s.last_attempted_sync < now() - interval '6 hours')
  order by s.last_attempted_sync asc nulls first, s.app_id
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.due_app_verified_revenue_sources(text,integer) from public, anon, authenticated;
grant execute on function public.due_app_verified_revenue_sources(text,integer) to service_role;

-- A new OAuth grant may cover different projects. Fence off every prior
-- in-flight sync and require each mapped app to verify again under this grant.
create function public.invalidate_app_verified_revenue_connection(
  p_connection_id uuid, p_owner_user_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.app_verified_revenue_connections c
    where c.id = p_connection_id and c.owner_user_id = p_owner_user_id;
  if not found then raise exception 'Revenue connection unavailable'; end if;
  update public.app_verified_revenue_sources s set
    mapping_version = s.mapping_version + 1,
    last_successful_sync = null, updated_at = now()
    where s.connection_id = p_connection_id and s.owner_user_id = p_owner_user_id;
  delete from public.public_app_verified_revenue p
    using public.app_verified_revenue_sources s
    where p.app_id = s.app_id and s.connection_id = p_connection_id;
end;
$$;
revoke all on function public.invalidate_app_verified_revenue_connection(uuid,uuid) from public, anon, authenticated;
grant execute on function public.invalidate_app_verified_revenue_connection(uuid,uuid) to service_role;

-- Use one service-role transaction to change source and primary provider.
create function public.bind_app_verified_revenue_source(
  p_app_id uuid, p_user_id uuid, p_connection_id uuid,
  p_provider text, p_external_account_id text, p_external_app_id text,
  p_product_ids text[]
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_provider not in ('revenuecat', 'polar', 'dodo')
    or length(p_external_account_id) not between 3 and 255
    or length(p_external_app_id) not between 3 and 255
    or coalesce(array_length(p_product_ids, 1), 0) not between 1 and 1000 then
    raise exception 'Invalid revenue source';
  end if;
  perform 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null
    and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  perform 1 from public.app_verified_revenue_connections c where c.id = p_connection_id
    and c.owner_user_id = p_user_id and c.provider = p_provider and c.status = 'active';
  if not found then raise exception 'Revenue connection unavailable'; end if;
  insert into public.app_verified_revenue_sources
    (app_id, connection_id, owner_user_id, provider, external_account_id, external_app_id, product_ids)
  values (p_app_id, p_connection_id, p_user_id, p_provider,
    p_external_account_id, p_external_app_id, p_product_ids)
  on conflict (app_id) do update set
    connection_id = excluded.connection_id, owner_user_id = excluded.owner_user_id,
    provider = excluded.provider, external_account_id = excluded.external_account_id,
    external_app_id = excluded.external_app_id, product_ids = excluded.product_ids,
    mapping_version = public.app_verified_revenue_sources.mapping_version + 1,
    visibility = 'private', last_successful_sync = null, updated_at = now();
  perform public.set_app_provider_selection(p_app_id, p_user_id, 'revenue', p_provider);
  delete from public.public_app_verified_revenue where app_id = p_app_id;
end;
$$;
revoke all on function public.bind_app_verified_revenue_source(uuid,uuid,uuid,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.bind_app_verified_revenue_source(uuid,uuid,uuid,text,text,text,text[]) to service_role;

-- A projection is materialized only from a fresh production point matching the
-- exact current mapping. Public RLS repeats the eligibility checks on reads.
create function public.refresh_app_verified_revenue_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.public_app_verified_revenue where app_id = p_app_id;
  insert into public.public_app_verified_revenue(app_id, provider, metric_type,
    visibility, currency, value_minor, range_lower_minor, range_upper_minor,
    period_start, period_end, observed_at, verified_at, mapping_version)
  select p_app_id, p.provider, p.metric_type, s.visibility, p.currency,
    case when s.visibility = 'exact' then p.value_minor end,
    case when s.visibility = 'range' then floor(p.value_minor / 100000) * 100000 end,
    case when s.visibility = 'range' then floor(p.value_minor / 100000) * 100000 + 99999.99 end,
    p.period_start, p.period_end, p.observed_at, p.verified_at, p.mapping_version
  from public.app_verified_revenue_sources s
  join public.app_verified_revenue_connections c on c.id = s.connection_id
  join public.app_provider_selection selected on selected.app_id = s.app_id
    and selected.owner_user_id = s.owner_user_id and selected.revenue_provider = s.provider
  join public.app_owners o on o.app_id = s.app_id and o.user_id = s.owner_user_id
  join lateral (select q.* from public.app_verified_revenue_points q
    where q.app_id = s.app_id and q.connection_id = s.connection_id
      and q.mapping_version = s.mapping_version and q.provider = s.provider
      and q.external_account_id = s.external_account_id
      and q.external_app_id = s.external_app_id
      and q.product_ids = s.product_ids
    order by q.verified_at desc limit 1) p on true
  where s.app_id = p_app_id and s.visibility <> 'private' and c.status = 'active'
    and c.last_successful_sync > now() - interval '72 hours'
    and s.last_successful_sync > now() - interval '72 hours'
    and p.verified_at > now() - interval '72 hours'
    and p.source_environment = 'production'
    and o.revoked_at is null and o.verification_level = 'domain_verified'
    and exists (select 1 from app_graph.apps a where a.id = p_app_id and a.is_public);
end;
$$;
revoke all on function public.refresh_app_verified_revenue_projection(uuid) from public, anon, authenticated;
grant execute on function public.refresh_app_verified_revenue_projection(uuid) to service_role;

create function public.app_verified_revenue_is_currently_public(
  p_app_id uuid, p_provider text, p_visibility text, p_mapping_version integer
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_verified_revenue_sources s
    join public.app_verified_revenue_connections c on c.id = s.connection_id
    join public.app_provider_selection selected on selected.app_id = s.app_id
      and selected.owner_user_id = s.owner_user_id and selected.revenue_provider = s.provider
    join public.app_owners o on o.app_id = s.app_id and o.user_id = s.owner_user_id
    where s.app_id = p_app_id and s.provider = p_provider
      and s.visibility = p_visibility and s.visibility <> 'private'
      and s.mapping_version = p_mapping_version
      and c.owner_user_id = s.owner_user_id and c.provider = s.provider
      and c.status = 'active' and c.last_successful_sync > now() - interval '72 hours'
      and s.last_successful_sync > now() - interval '72 hours'
      and o.revoked_at is null and o.verification_level = 'domain_verified'
      and exists(select 1 from public.public_apps a where a.id = s.app_id));
$$;
revoke all on function public.app_verified_revenue_is_currently_public(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.app_verified_revenue_is_currently_public(uuid,text,text,integer) to anon, authenticated;
create policy "Read fresh consented alternative revenue" on public.public_app_verified_revenue
  for select to anon, authenticated using (
    verified_at > now() - interval '72 hours'
    and public.app_verified_revenue_is_currently_public(app_id,provider,visibility,mapping_version));

create function public.disconnect_app_verified_revenue(p_app_id uuid, p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_connection_id uuid;
begin
  perform 1 from public.app_owners o where o.app_id = p_app_id and o.user_id = p_user_id
    and o.revoked_at is null and o.verification_level = 'domain_verified' for update;
  if not found then raise exception 'A domain-verified app owner is required'; end if;
  select connection_id into v_connection_id from public.app_verified_revenue_sources
    where app_id = p_app_id and owner_user_id = p_user_id for update;
  if v_connection_id is null then raise exception 'Revenue source unavailable'; end if;
  delete from public.public_app_verified_revenue where app_id = p_app_id;
  delete from public.app_verified_revenue_sources where app_id = p_app_id;
  perform public.set_app_provider_selection(p_app_id, p_user_id, 'revenue', null);
  if not exists (select 1 from public.app_verified_revenue_sources where connection_id = v_connection_id) then
    update public.app_verified_revenue_connections set status = 'disconnected',
      access_token_ciphertext = null, access_token_iv = null,
      refresh_token_ciphertext = null, refresh_token_iv = null,
      access_token_expires_at = null, updated_at = now()
      where id = v_connection_id and owner_user_id = p_user_id;
  end if;
end;
$$;
revoke all on function public.disconnect_app_verified_revenue(uuid,uuid) from public, anon, authenticated;
grant execute on function public.disconnect_app_verified_revenue(uuid,uuid) to service_role;

create function public.clear_app_verified_revenue_on_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_revoke boolean;
begin
  v_revoke := tg_op = 'DELETE';
  if tg_op = 'UPDATE' then
    v_revoke := new.user_id is distinct from old.user_id or new.revoked_at is not null;
  end if;
  if v_revoke then
    delete from public.public_app_verified_revenue where app_id = old.app_id;
    delete from public.app_verified_revenue_sources where app_id = old.app_id;
    update public.app_verified_revenue_connections c set status = 'disconnected',
      access_token_ciphertext = null, access_token_iv = null,
      refresh_token_ciphertext = null, refresh_token_iv = null,
      access_token_expires_at = null, updated_at = now()
      where c.owner_user_id = old.user_id and not exists (
        select 1 from public.app_verified_revenue_sources s where s.connection_id = c.id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.clear_app_verified_revenue_on_owner_change() from public, anon, authenticated;
create trigger clear_alternative_revenue_when_owner_changes
  after update or delete on public.app_owners for each row
  execute function public.clear_app_verified_revenue_on_owner_change();
