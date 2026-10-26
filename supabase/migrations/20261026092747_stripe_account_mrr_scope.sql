-- Keep existing product mappings and public consent unchanged. New syncs can
-- explicitly select the whole connected account; credentials are unaffected.
alter table public.app_revenue_bindings add column revenue_scope text not null default 'products'
  check (revenue_scope in ('account','products'));
alter table public.public_app_revenue add column revenue_scope text not null default 'products'
  check (revenue_scope in ('account','products'));
alter table public.app_revenue_metric_points add column unsupported_reasons jsonb not null default '{}';

-- Serialize across different OAuth connections to the same external account,
-- including connections owned by different Rocket users. Account totals cannot
-- overlap any other app binding. Existing product-specific bindings can coexist.
create function public.guard_stripe_revenue_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_account text; v_live boolean;
begin
  select external_account_id,livemode into v_account,v_live
    from public.app_revenue_connections where id=new.connection_id;
  perform pg_advisory_xact_lock(hashtextextended('stripe-mrr:'||v_account||':'||v_live::text,0));
  if exists (select 1 from public.app_revenue_bindings b
    join public.app_revenue_connections c on c.id=b.connection_id
    where b.app_id<>new.app_id and c.external_account_id=v_account and c.livemode=v_live
      and (new.revenue_scope='account' or b.revenue_scope='account')) then
    raise exception 'This Stripe account is already used by another app. Use specific products for shared accounts.' using errcode='23505';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_stripe_revenue_scope() from public,anon,authenticated;
create trigger guard_stripe_revenue_scope before insert or update of connection_id,revenue_scope
  on public.app_revenue_bindings for each row execute function public.guard_stripe_revenue_scope();

-- Only the authenticated handler supplies prices verified against Stripe. CAS
-- protects a sync from an overlapping mapping edit. Scope changes revoke public
-- visibility; repeated syncs of the same scope retain the owner's visibility.
create function public.configure_app_stripe_revenue(
 p_app_id uuid,p_connection_id uuid,p_user_id uuid,p_scope text,p_prices jsonb,p_expected_version integer default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_binding public.app_revenue_bindings; v_version integer; v_account text; v_live boolean;
begin
  if p_scope not in ('account','products') or jsonb_typeof(p_prices) is distinct from 'array'
    or jsonb_array_length(p_prices)>(case when p_scope='account' then 2000 else 100 end) then
    raise exception 'Invalid revenue scope or price mapping';
  end if;
  select external_account_id,livemode into v_account,v_live from public.app_revenue_connections
    where id=p_connection_id and owner_user_id=p_user_id and status='active';
  if v_account is null or not exists(select 1 from public.app_owners
    where app_id=p_app_id and user_id=p_user_id and revoked_at is null and verification_level='domain_verified') then
    raise exception 'App owner or revenue connection changed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-mrr:'||v_account||':'||v_live::text,0));
  select * into v_binding from public.app_revenue_bindings
    where app_id=p_app_id and connection_id=p_connection_id and owner_user_id=p_user_id for update;
  if v_binding.app_id is null then raise exception 'App revenue connection not found'; end if;
  if p_expected_version is not null and v_binding.mapping_version<>p_expected_version then
    raise exception 'Price mapping changed during sync; retry';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_prices) as r(product_id text,price_id text,currency text)
    where r.product_id is null or r.product_id !~ '^prod_[A-Za-z0-9]+$'
      or r.price_id is null or r.price_id !~ '^price_[A-Za-z0-9]+$'
      or r.currency is null or r.currency !~ '^[a-z]{3}$') then raise exception 'Invalid Stripe price'; end if;
  if exists(select 1 from public.app_stripe_price_mappings m
    join public.app_revenue_connections c on c.id=m.connection_id
    join jsonb_to_recordset(p_prices) as r(price_id text) on r.price_id=m.stripe_price_id
    where m.app_id<>p_app_id and c.external_account_id=v_account and c.livemode=v_live) then
    raise exception 'A price is already assigned to another Rocket app' using errcode='23505';
  end if;
  update public.app_revenue_bindings set revenue_scope=p_scope,mapping_version=mapping_version+1,
    visibility=case when revenue_scope=p_scope then visibility else 'private' end,updated_at=now()
    where app_id=p_app_id returning mapping_version into v_version;
  delete from public.app_stripe_price_mappings where app_id=p_app_id;
  insert into public.app_stripe_price_mappings(app_id,connection_id,stripe_product_id,stripe_price_id,currency)
    select p_app_id,p_connection_id,r.product_id,r.price_id,r.currency
    from jsonb_to_recordset(p_prices) as r(product_id text,price_id text,currency text);
  delete from public.public_app_revenue where app_id=p_app_id;
  return v_version;
end;
$$;
revoke all on function public.configure_app_stripe_revenue(uuid,uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.configure_app_stripe_revenue(uuid,uuid,uuid,text,jsonb,integer) to service_role;

-- Preserve the existing RPC signature for older deployed clients.
create or replace function public.replace_app_stripe_price_mappings(
 p_app_id uuid,p_connection_id uuid,p_user_id uuid,p_prices jsonb
) returns integer language sql security invoker set search_path='' as $$
 select public.configure_app_stripe_revenue(p_app_id,p_connection_id,p_user_id,'products',p_prices,null);
$$;

create or replace function public.refresh_app_revenue_projection(p_app_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.public_app_revenue where app_id = p_app_id;
  insert into public.public_app_revenue(app_id,currency,metric_type,visibility,mrr_minor,
    range_lower_minor,range_upper_minor,observed_at,last_verified_at,provider,revenue_scope)
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
    p.observed_at,c.last_successful_sync,'stripe',b.revenue_scope
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


-- Private, service-only diagnostics contain reason codes and counts, no customer data.
create function public.latest_app_revenue_scope_points(p_app_id uuid,p_mapping_version integer)
returns table(currency text,mrr_minor numeric,observed_at timestamptz,verification_status text,
 source_livemode boolean,unsupported_subscriptions integer,unsupported_reasons jsonb)
language sql stable security invoker set search_path='' as $$
 select distinct on(p.currency) p.currency,p.mrr_minor,p.observed_at,p.verification_status,
 p.source_livemode,p.unsupported_subscriptions,p.unsupported_reasons
 from public.app_revenue_metric_points p where p.app_id=p_app_id and p.mapping_version=p_mapping_version
 order by p.currency,p.observed_at desc;
$$;
revoke all on function public.latest_app_revenue_scope_points(uuid,integer) from public,anon,authenticated;
grant execute on function public.latest_app_revenue_scope_points(uuid,integer) to service_role;
