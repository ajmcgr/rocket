-- GA4 verified traffic. All credentials and raw points remain service-only.
-- Applied to production as migration 20260929044943.
create table public.app_data_connections (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'ga4'),
  status text not null default 'select_property' check (status in ('select_property','active','error','disconnected')),
  property_id text,
  property_name text,
  stream_id text,
  verified_hostname text,
  time_zone text,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  last_attempted_sync timestamptz,
  last_successful_sync timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, provider),
  check (status = 'disconnected' or (refresh_token_ciphertext is not null and refresh_token_iv is not null)),
  check (status <> 'active' or (property_id is not null and stream_id is not null
    and verified_hostname is not null and time_zone is not null))
);
create index app_data_connections_active_idx on public.app_data_connections (status, last_successful_sync)
  where status = 'active';

create table public.app_data_oauth_states (
  state_hash text primary key,
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pkce_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index app_data_oauth_states_expiry_idx on public.app_data_oauth_states (expires_at);

create table public.app_metric_points (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  connection_id uuid not null references public.app_data_connections(id) on delete cascade,
  provider text not null check (provider = 'ga4'),
  metric_type text not null check (metric_type in ('active_users','sessions','views')),
  metric_date date not null,
  metric_value bigint not null check (metric_value >= 0),
  property_id text not null,
  verified_hostname text not null,
  time_zone text not null,
  observed_through timestamptz not null,
  verification_status text not null check (verification_status in ('verified','stale')),
  calculation_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, metric_type, metric_date)
);
create index app_metric_points_app_date_idx on public.app_metric_points (app_id, metric_type, metric_date desc);

create table public.app_metric_visibility (
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  metric_type text not null check (metric_type in ('active_users','sessions','views')),
  visibility text not null default 'private' check (visibility in ('private','verified_only','range','exact')),
  updated_at timestamptz not null default now(),
  primary key (app_id, metric_type)
);

-- This table contains only permissioned, already-redacted public fields.
create table public.public_app_traction (
  app_id uuid not null references app_graph.apps(id) on delete cascade,
  metric_type text not null check (metric_type in ('active_users','sessions','views')),
  visibility text not null check (visibility in ('verified_only','range','exact')),
  value bigint,
  value_range text,
  metric_date date not null,
  provider text not null check (provider = 'ga4'),
  last_verified_at timestamptz not null,
  primary key (app_id, metric_type),
  check ((visibility = 'exact' and value is not null and value_range is null)
    or (visibility = 'range' and value is null and value_range is not null)
    or (visibility = 'verified_only' and value is null and value_range is null))
);

alter table public.app_data_connections enable row level security;
alter table public.app_data_oauth_states enable row level security;
alter table public.app_metric_points enable row level security;
alter table public.app_metric_visibility enable row level security;
alter table public.public_app_traction enable row level security;
revoke all on public.app_data_connections, public.app_data_oauth_states,
  public.app_metric_points, public.app_metric_visibility, public.public_app_traction
  from public, anon, authenticated;
grant all on public.app_data_connections, public.app_data_oauth_states,
  public.app_metric_points, public.app_metric_visibility, public.public_app_traction to service_role;
grant select on public.public_app_traction to anon, authenticated;

-- The projection is a cache. Check current consent/status at read time so a
-- failed cache refresh cannot expose a value after privacy is tightened.
create function public.app_traction_is_currently_public(
  p_app_id uuid, p_metric_type text, p_visibility text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_metric_visibility v
    join public.app_data_connections c on c.app_id = v.app_id and c.provider = 'ga4'
    join public.app_owners o on o.app_id = v.app_id
    where v.app_id = p_app_id and v.metric_type = p_metric_type
      and v.visibility = p_visibility and v.visibility <> 'private'
      and c.status = 'active' and c.last_successful_sync > now() - interval '72 hours'
      and o.revoked_at is null and o.user_id = c.owner_user_id
      and o.verification_level = 'domain_verified'
  );
$$;
revoke all on function public.app_traction_is_currently_public(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.app_traction_is_currently_public(uuid,text,text)
  to anon, authenticated;
create policy "Read consented app traction" on public.public_app_traction for select to anon, authenticated
  using (last_verified_at > now() - interval '72 hours'
    and public.app_traction_is_currently_public(app_id, metric_type, visibility)
    and exists (select 1 from public.public_apps a where a.id = app_id));

-- Atomic one-use OAuth state claim, called only by the callback's service role.
create function public.consume_app_data_oauth_state(p_state_hash text)
returns table(app_id uuid, user_id uuid, pkce_verifier text)
language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.app_data_oauth_states s
    set consumed_at = now()
    where s.state_hash = p_state_hash and s.consumed_at is null and s.expires_at > now()
    returning s.app_id, s.user_id, s.pkce_verifier;
end;
$$;
revoke all on function public.consume_app_data_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_app_data_oauth_state(text) to service_role;

-- One transaction removes all formerly public rows before re-projecting consented fresh points.
create function public.refresh_app_traction_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.public_app_traction where app_id = p_app_id;
  insert into public.public_app_traction
    (app_id, metric_type, visibility, value, value_range, metric_date, provider, last_verified_at)
  select p_app_id, v.metric_type, v.visibility,
    case when v.visibility = 'exact' then p.metric_value else null end,
    case when v.visibility = 'range' then
      case when p.metric_value = 0 then '0'
        when p.metric_value < 100 then '1–99'
        when p.metric_value < 1000 then '100–999'
        when p.metric_value < 10000 then '1K–9.9K'
        when p.metric_value < 100000 then '10K–99.9K'
        else '100K+' end
      else null end,
    p.metric_date, 'ga4', c.last_successful_sync
  from public.app_metric_visibility v
  join public.app_data_connections c on c.app_id = v.app_id and c.provider = 'ga4'
  join lateral (
    select q.* from public.app_metric_points q
    where q.connection_id = c.id and q.metric_type = v.metric_type
      and q.verification_status = 'verified'
    order by q.metric_date desc limit 1
  ) p on true
  where v.app_id = p_app_id and v.visibility <> 'private' and c.status = 'active'
    and c.last_successful_sync > now() - interval '72 hours'
    and exists (select 1 from app_graph.apps a where a.id = p_app_id and a.is_public)
  on conflict (app_id, metric_type) do update set
    visibility = excluded.visibility, value = excluded.value,
    value_range = excluded.value_range, metric_date = excluded.metric_date,
    last_verified_at = excluded.last_verified_at;
end;
$$;
revoke all on function public.refresh_app_traction_projection(uuid) from public, anon, authenticated;
grant execute on function public.refresh_app_traction_projection(uuid) to service_role;

-- Ownership revocation/transfer invalidates GA credentials and public evidence
-- in the same transaction, without waiting for the next scheduled sync.
create function public.revoke_app_data_on_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_app_id uuid; v_revoke boolean;
begin
  v_app_id := old.app_id;
  if tg_op = 'DELETE' then
    v_revoke := true;
  else
    v_revoke := new.user_id is distinct from old.user_id or new.revoked_at is not null;
  end if;
  if v_revoke then
    update public.app_data_connections set status = 'disconnected',
      refresh_token_ciphertext = null, refresh_token_iv = null,
      last_error = 'App ownership changed', updated_at = now()
      where app_id = v_app_id and status <> 'disconnected';
    delete from public.public_app_traction where app_id = v_app_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.revoke_app_data_on_owner_change() from public, anon, authenticated;
create trigger revoke_app_data_when_owner_changes
  after update or delete on public.app_owners
  for each row execute function public.revoke_app_data_on_owner_change();
