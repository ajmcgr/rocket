-- Slice 3 revenue verification is independent of Rocket billing and Connect Payments.
-- Private provider credentials, mappings, and points are service-role only.
create table public.app_revenue_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'stripe'),
  external_account_id text not null,
  livemode boolean not null default false,
  status text not null check (status in ('active','error','disconnected')),
  refresh_token_ciphertext text,
  refresh_token_iv text,
  access_token_ciphertext text,
  access_token_iv text,
  access_token_expires_at timestamptz,
  last_attempted_sync timestamptz,
  last_successful_sync timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, provider, external_account_id, livemode),
  check (status = 'disconnected' or (refresh_token_ciphertext is not null and refresh_token_iv is not null))
);
create index app_revenue_connections_owner_idx on public.app_revenue_connections(owner_user_id, status);

-- One Rocket app can use one revenue account; one account may serve many apps.
create table public.app_revenue_bindings (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  connection_id uuid not null references public.app_revenue_connections(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  mapping_version integer not null default 0 check (mapping_version >= 0),
  visibility text not null default 'private' check (visibility in ('private','verified_only','range','exact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_revenue_bindings_connection_idx on public.app_revenue_bindings(connection_id);
create index app_revenue_bindings_owner_idx on public.app_revenue_bindings(owner_user_id);

create table public.app_stripe_price_mappings (
  app_id uuid not null references public.app_revenue_bindings(app_id) on delete cascade,
  connection_id uuid not null references public.app_revenue_connections(id),
  stripe_product_id text not null,
  stripe_price_id text not null,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  created_at timestamptz not null default now(),
  primary key (app_id, stripe_price_id),
  unique (connection_id, stripe_price_id)
);
create index app_stripe_price_mappings_connection_idx on public.app_stripe_price_mappings(connection_id);

create table public.app_revenue_oauth_states (
  state_hash text primary key,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index app_revenue_oauth_states_expiry_idx on public.app_revenue_oauth_states(expires_at);

-- Values use six decimal places of Stripe's minor currency unit, retaining
-- exact monthly normalization for prices with non-monthly intervals.
create table public.app_revenue_metric_points (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  connection_id uuid not null references public.app_revenue_connections(id),
  provider text not null check (provider = 'stripe'),
  metric_type text not null check (metric_type = 'subscription_mrr'),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  mrr_minor numeric(20,6) not null check (mrr_minor >= 0),
  mapping_version integer not null,
  included_subscriptions integer not null check (included_subscriptions >= 0),
  excluded_subscriptions integer not null check (excluded_subscriptions >= 0),
  unsupported_subscriptions integer not null check (unsupported_subscriptions >= 0),
  verification_status text not null check (verification_status in ('verified','unsupported')),
  calculation_version integer not null,
  source_livemode boolean not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index app_revenue_metric_points_latest_idx
  on public.app_revenue_metric_points(app_id, currency, observed_at desc);
create index app_revenue_metric_points_connection_idx on public.app_revenue_metric_points(connection_id);

-- Public data is an explicit, redacted projection. Sandbox points never enter it.
create table public.public_app_revenue (
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  metric_type text not null check (metric_type = 'subscription_mrr'),
  visibility text not null check (visibility in ('verified_only','range','exact')),
  mrr_minor numeric(20,6),
  range_lower_minor numeric(20,6),
  range_upper_minor numeric(20,6),
  observed_at timestamptz not null,
  last_verified_at timestamptz not null,
  provider text not null check (provider = 'stripe'),
  primary key (app_id, currency),
  check ((visibility = 'exact' and mrr_minor is not null and range_lower_minor is null and range_upper_minor is null)
    or (visibility = 'range' and mrr_minor is null and range_lower_minor is not null)
    or (visibility = 'verified_only' and mrr_minor is null and range_lower_minor is null and range_upper_minor is null))
);

alter table public.app_revenue_connections enable row level security;
alter table public.app_revenue_bindings enable row level security;
alter table public.app_stripe_price_mappings enable row level security;
alter table public.app_revenue_oauth_states enable row level security;
alter table public.app_revenue_metric_points enable row level security;
alter table public.public_app_revenue enable row level security;
revoke all on public.app_revenue_connections, public.app_revenue_bindings,
  public.app_stripe_price_mappings, public.app_revenue_oauth_states,
  public.app_revenue_metric_points, public.public_app_revenue from public, anon, authenticated;
grant all on public.app_revenue_connections, public.app_revenue_bindings,
  public.app_stripe_price_mappings, public.app_revenue_oauth_states,
  public.app_revenue_metric_points, public.public_app_revenue to service_role;
grant select on public.public_app_revenue to anon, authenticated;

create function public.consume_app_revenue_oauth_state(p_state_hash text)
returns table(app_id uuid, user_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.app_revenue_oauth_states s set consumed_at = now()
    where s.state_hash = p_state_hash and s.consumed_at is null and s.expires_at > now()
    returning s.app_id, s.user_id;
end;
$$;
revoke all on function public.consume_app_revenue_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_app_revenue_oauth_state(text) to service_role;

-- A service-only transaction prevents partial remapping and immediately removes
-- any stale public projection when the mapping changes.
create function public.replace_app_stripe_price_mappings(
  p_app_id uuid, p_connection_id uuid, p_user_id uuid, p_prices jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_version integer;
begin
  if jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) > 100 then
    raise exception 'Invalid price mapping';
  end if;
  if not exists (select 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null and o.verification_level = 'domain_verified')
    or not exists (select 1 from public.app_revenue_connections c where c.id = p_connection_id
      and c.owner_user_id = p_user_id and c.status = 'active') then
    raise exception 'App owner or revenue connection changed';
  end if;
  update public.app_revenue_bindings b set mapping_version = b.mapping_version + 1, updated_at = now()
    where b.app_id = p_app_id and b.connection_id = p_connection_id and b.owner_user_id = p_user_id
    returning b.mapping_version into v_version;
  if v_version is null then raise exception 'App revenue connection not found'; end if;
  delete from public.app_stripe_price_mappings where app_id = p_app_id;
  insert into public.app_stripe_price_mappings(app_id,connection_id,stripe_product_id,stripe_price_id,currency)
    select p_app_id,p_connection_id,r.product_id,r.price_id,r.currency
    from jsonb_to_recordset(p_prices) as r(product_id text, price_id text, currency text);
  delete from public.public_app_revenue where app_id = p_app_id;
  return v_version;
end;
$$;
revoke all on function public.replace_app_stripe_price_mappings(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_app_stripe_price_mappings(uuid,uuid,uuid,jsonb) to service_role;

create function public.bind_app_revenue_connection(
  p_app_id uuid, p_connection_id uuid, p_user_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_current uuid;
begin
  if not exists (select 1 from public.app_revenue_connections c where c.id = p_connection_id
    and c.owner_user_id = p_user_id and c.status = 'active') then
    raise exception 'Revenue connection unavailable';
  end if;
  if not exists (select 1 from public.app_owners o where o.app_id = p_app_id
    and o.user_id = p_user_id and o.revoked_at is null and o.verification_level = 'domain_verified') then
    raise exception 'A domain-verified app owner is required';
  end if;
  select connection_id into v_current from public.app_revenue_bindings where app_id = p_app_id for update;
  if v_current is not null and v_current <> p_connection_id then
    delete from public.app_stripe_price_mappings where app_id = p_app_id;
  end if;
  insert into public.app_revenue_bindings(app_id,connection_id,owner_user_id)
    values(p_app_id,p_connection_id,p_user_id)
    on conflict(app_id) do update set connection_id = excluded.connection_id,
      owner_user_id = excluded.owner_user_id,
      mapping_version = case when public.app_revenue_bindings.connection_id = excluded.connection_id
        then public.app_revenue_bindings.mapping_version else public.app_revenue_bindings.mapping_version + 1 end,
      visibility = case when public.app_revenue_bindings.connection_id = excluded.connection_id
        then public.app_revenue_bindings.visibility else 'private' end,
      updated_at = now();
  delete from public.public_app_revenue where app_id = p_app_id;
end;
$$;
revoke all on function public.bind_app_revenue_connection(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.bind_app_revenue_connection(uuid,uuid,uuid) to service_role;

create function public.disconnect_app_revenue(p_app_id uuid, p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_connection_id uuid;
begin
  select connection_id into v_connection_id from public.app_revenue_bindings
    where app_id = p_app_id and owner_user_id = p_user_id for update;
  if v_connection_id is null then raise exception 'Revenue connection unavailable'; end if;
  delete from public.public_app_revenue where app_id = p_app_id;
  delete from public.app_revenue_bindings where app_id = p_app_id;
  if v_connection_id is not null and not exists (
    select 1 from public.app_revenue_bindings where connection_id = v_connection_id) then
    update public.app_revenue_connections set status = 'disconnected',
      refresh_token_ciphertext = null, refresh_token_iv = null,
      access_token_ciphertext = null, access_token_iv = null,
      access_token_expires_at = null, updated_at = now()
      where id = v_connection_id;
  end if;
end;
$$;
revoke all on function public.disconnect_app_revenue(uuid,uuid) from public, anon, authenticated;
grant execute on function public.disconnect_app_revenue(uuid,uuid) to service_role;

create function public.latest_app_revenue_points(p_app_id uuid, p_mapping_version integer)
returns table(currency text, mrr_minor numeric, observed_at timestamptz,
  verification_status text, source_livemode boolean, unsupported_subscriptions integer)
language sql stable security invoker set search_path = '' as $$
  select distinct on (p.currency) p.currency,p.mrr_minor,p.observed_at,
    p.verification_status,p.source_livemode,p.unsupported_subscriptions
  from public.app_revenue_metric_points p
  where p.app_id = p_app_id and p.mapping_version = p_mapping_version
  order by p.currency,p.observed_at desc;
$$;
revoke all on function public.latest_app_revenue_points(uuid,integer) from public, anon, authenticated;
grant execute on function public.latest_app_revenue_points(uuid,integer) to service_role;

-- Defense in depth: the projection is not readable if consent, ownership,
-- connection health, or freshness changed since projection was built.
create function public.app_revenue_is_currently_public(
  p_app_id uuid, p_currency text, p_visibility text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_revenue_bindings b
    join public.app_revenue_connections c on c.id = b.connection_id
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
revoke all on function public.app_revenue_is_currently_public(uuid,text,text) from public, anon, authenticated;
grant execute on function public.app_revenue_is_currently_public(uuid,text,text) to anon, authenticated;
create policy "Read consented verified app revenue" on public.public_app_revenue
  for select to anon, authenticated using (
    last_verified_at > now() - interval '72 hours'
    and public.app_revenue_is_currently_public(app_id,currency,visibility)
    and exists (select 1 from public.public_apps a where a.id = app_id)
  );

create function public.refresh_app_revenue_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.public_app_revenue where app_id = p_app_id;
  insert into public.public_app_revenue(app_id,currency,metric_type,visibility,mrr_minor,
    range_lower_minor,range_upper_minor,observed_at,last_verified_at,provider)
  select p_app_id,p.currency,'subscription_mrr',b.visibility,
    case when b.visibility = 'exact' then p.mrr_minor else null end,
    case when b.visibility = 'range' then
      case when p.mrr_minor < 100000 then 0
        when p.mrr_minor < 1000000 then 100000
        when p.mrr_minor < 10000000 then 1000000
        else 10000000 end else null end,
    case when b.visibility = 'range' then
      case when p.mrr_minor < 100000 then 99999.999999
        when p.mrr_minor < 1000000 then 999999.999999
        when p.mrr_minor < 10000000 then 9999999.999999
        else null end else null end,
    p.observed_at,c.last_successful_sync,'stripe'
  from public.app_revenue_bindings b
  join public.app_revenue_connections c on c.id = b.connection_id
  join lateral (
    select distinct on (q.currency) q.* from public.app_revenue_metric_points q
    where q.app_id = p_app_id and q.connection_id = c.id
      and q.mapping_version = b.mapping_version
    order by q.currency,q.observed_at desc
  ) p on true
  where b.app_id = p_app_id and b.visibility <> 'private' and c.status = 'active'
    and c.livemode and c.last_successful_sync > now() - interval '72 hours'
    and p.observed_at > now() - interval '72 hours'
    and p.verification_status = 'verified' and p.source_livemode
    and exists (select 1 from app_graph.apps a where a.id = p_app_id and a.is_public)
    and exists (select 1 from public.app_owners o where o.app_id = p_app_id
      and o.user_id = b.owner_user_id and o.revoked_at is null and o.verification_level = 'domain_verified');
end;
$$;
revoke all on function public.refresh_app_revenue_projection(uuid) from public, anon, authenticated;
grant execute on function public.refresh_app_revenue_projection(uuid) to service_role;

create function public.revoke_app_revenue_on_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_revoke boolean;
begin
  v_revoke := tg_op = 'DELETE';
  if tg_op = 'UPDATE' then
    v_revoke := new.user_id is distinct from old.user_id or new.revoked_at is not null;
  end if;
  if v_revoke then
    delete from public.public_app_revenue where app_id = old.app_id;
    delete from public.app_stripe_price_mappings where app_id = old.app_id;
    delete from public.app_revenue_bindings where app_id = old.app_id;
    update public.app_revenue_connections c set status = 'disconnected',
      refresh_token_ciphertext = null, refresh_token_iv = null,
      access_token_ciphertext = null, access_token_iv = null,
      access_token_expires_at = null, updated_at = now()
      where c.owner_user_id = old.user_id and not exists (
        select 1 from public.app_revenue_bindings b where b.connection_id = c.id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.revoke_app_revenue_on_owner_change() from public, anon, authenticated;
create trigger revoke_app_revenue_when_owner_changes
  after update or delete on public.app_owners
  for each row execute function public.revoke_app_revenue_on_owner_change();
