-- Review-only: no seed picks, product activation, checkout gates or visibility changes.
-- Structured, explicitly owner-declared evaluation fields extend the existing overlay.
alter table public.app_owner_presentations
  add column pricing_kind text check (pricing_kind in ('free','paid','freemium','unknown')),
  add column billing_model text check (billing_model in ('one_time','subscription','both','unknown')),
  add column outcome text check (length(outcome)<=500),
  add column prerequisites text check (length(prerequisites)<=1000),
  add column additional_costs text check (length(additional_costs)<=500),
  add column support_url text check (support_url ~ '^https://[^[:space:]]+$'),
  add column privacy_url text check (privacy_url ~ '^https://[^[:space:]]+$');
grant select(pricing_kind,billing_model,outcome,prerequisites,additional_costs,support_url,privacy_url)
  on public.app_owner_presentations to anon,authenticated;
-- Ownership rows and updated_by are private. Publish only a validation boolean.
create function public.marketplace_details_current(p_app_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_owner_presentations p join public.app_owners o
    on o.app_id=p.app_id and o.user_id=p.updated_by join public.public_apps a on a.id=p.app_id
    where p.app_id=p_app_id and o.revoked_at is null and o.verification_level='domain_verified');
$$;
revoke all on function public.marketplace_details_current(uuid) from public;
grant execute on function public.marketplace_details_current(uuid) to anon,authenticated,service_role;
create function app_graph.clear_stale_marketplace_details() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    update public.app_owner_presentations set pricing_kind=null,billing_model=null,outcome=null,prerequisites=null,
      additional_costs=null,support_url=null,privacy_url=null where app_id=old.app_id;
    return old;
  end if;
  if new.revoked_at is not null or new.verification_level<>'domain_verified' or new.user_id is distinct from old.user_id then
    update public.app_owner_presentations set pricing_kind=null,billing_model=null,outcome=null,prerequisites=null,
      additional_costs=null,support_url=null,privacy_url=null where app_id=new.app_id;
  end if;
  return new;
end $$;
revoke all on function app_graph.clear_stale_marketplace_details() from public,anon,authenticated;
create trigger clear_stale_marketplace_details after update or delete on public.app_owners
  for each row execute function app_graph.clear_stale_marketplace_details();
create view public.public_marketplace_details with (security_invoker=true) as
select p.app_id,coalesce(p.pricing_kind,'unknown') pricing_kind,coalesce(p.billing_model,'unknown') billing_model,
  p.outcome,p.prerequisites,p.additional_costs,p.support_url,p.privacy_url
from public.app_owner_presentations p join public.public_apps a on a.id=p.app_id
where public.marketplace_details_current(p.app_id);
revoke all on public.public_marketplace_details from public;
grant select on public.public_marketplace_details to anon,authenticated,service_role;

create function public.set_app_marketplace_details(p_app_id uuid,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.app_owners where app_id=p_app_id
    and user_id=auth.uid() and revoked_at is null and verification_level='domain_verified') then
    raise exception 'Verified app ownership required' using errcode='42501';
  end if;
  insert into public.app_owner_presentations(app_id,updated_by) values(p_app_id,auth.uid()) on conflict do nothing;
  update public.app_owner_presentations set pricing_kind=coalesce(p_details->>'pricing_kind','unknown'),
    billing_model=coalesce(p_details->>'billing_model','unknown'),outcome=nullif(btrim(p_details->>'outcome'),''),
    prerequisites=nullif(btrim(p_details->>'prerequisites'),''),additional_costs=nullif(btrim(p_details->>'additional_costs'),''),
    support_url=nullif(btrim(p_details->>'support_url'),''),privacy_url=nullif(btrim(p_details->>'privacy_url'),''),
    updated_by=auth.uid(),updated_at=now() where app_id=p_app_id;
end $$;
revoke all on function public.set_app_marketplace_details(uuid,jsonb) from public,anon;
grant execute on function public.set_app_marketplace_details(uuid,jsonb) to authenticated;

-- Server-side relevance is applied BEFORE pagination. Unknown prices are never free.
create function public.search_marketplace(p_query text default '',p_category text default '',p_platform text default '',
  p_pricing text default '',p_billing text default '',p_source text default '',p_sort text default 'discovered',
  p_offset integer default 0,p_limit integer default 24) returns jsonb
language sql stable security invoker set search_path='' as $$
  with q as (select left(lower(btrim(coalesce(p_query,''))),80) term), matches as (
    select a.*, case when lower(a.name)=q.term then 100 when left(lower(a.name),length(q.term))=q.term then 80
      when strpos(lower(a.name),q.term)>0 then 60 when strpos(lower(coalesce(a.tagline,'')),q.term)>0 then 40 else 20 end relevance
    from public.public_discoverable_apps a cross join q left join public.public_marketplace_details d on d.app_id=a.id
    where (q.term='' or strpos(lower(a.name||' '||coalesce(a.tagline,'')||' '||coalesce(a.description,'')),q.term)>0)
      and (coalesce(p_category,'')='' or p_category=any(a.categories))
      and (coalesce(p_platform,'')='' or p_platform=any(a.platforms))
      and (coalesce(p_source,'')='' or (p_source='launch' and a.launch_url is not null))
      and (coalesce(p_pricing,'')='' or coalesce(d.pricing_kind,'unknown')=p_pricing)
      and (coalesce(p_billing,'')='' or d.billing_model=p_billing or (d.billing_model='both' and p_billing in ('one_time','subscription')))
  ), page as (select m.* from matches m cross join q
    order by case when q.term<>'' then m.relevance else 0 end desc,
      case when p_sort='launched' then m.launched_at else m.discovered_at end desc nulls last,m.id
    limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0))
  select jsonb_build_object('apps',coalesce((select jsonb_agg(to_jsonb(page)-'relevance') from page),'[]'::jsonb),'total',(select count(*) from matches));
$$;
revoke all on function public.search_marketplace(text,text,text,text,text,text,text,integer,integer) from public;
grant execute on function public.search_marketplace(text,text,text,text,text,text,text,integer,integer) to anon,authenticated;

-- Existing Rocket Picks supply both public editorial reasons and small collections.
-- editorial_note remains PRIVATE. Public headline is the selection reason.
alter table public.rocket_editorial_picks add column collection text
  check (collection in ('build','work','create'));
grant select(collection) on public.rocket_editorial_picks to anon,authenticated;
create or replace view public.public_rocket_picks with (security_invoker=true) as
select p.app_id,p.placement,p.headline,p.featured_at,p.collection
from public.rocket_editorial_picks p join public.public_discoverable_apps a on a.id=p.app_id where p.status='featured';
create function public.set_rocket_pick_collection(p_app_id uuid,p_collection text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_rocket_admin(),false) then raise exception 'Admin access denied' using errcode='42501'; end if;
  update public.rocket_editorial_picks set collection=p_collection where app_id=p_app_id and status='featured';
  insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id,context)
    values(auth.uid(),'set_pick_collection','app',p_app_id::text,jsonb_build_object('collection',p_collection));
end $$;
revoke all on function public.set_rocket_pick_collection(uuid,text) from public,anon;
grant execute on function public.set_rocket_pick_collection(uuid,text) to authenticated;

-- Publish only opted-in profile fields, with canonical attribution from active ownership.
create function public.get_app_developer(p_app_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('username',p.username,'full_name',p.full_name)
  from public.app_owners o join public.member_public_profiles p on p.user_id=o.user_id
  join public.public_discoverable_apps a on a.id=o.app_id
  where o.app_id=p_app_id and o.revoked_at is null and o.verification_level='domain_verified'
  order by p.username limit 1;
$$;
revoke all on function public.get_app_developer(uuid) from public;
grant execute on function public.get_app_developer(uuid) to anon,authenticated,service_role;
create or replace view public.public_app_card_metadata with (security_invoker=true) as
select a.id app_id,coalesce(s.save_count,0) save_count,coalesce(r.rating_count,0) rating_count,
  (public.get_app_developer(a.id)->>'username') developer_handle,
  (public.get_app_developer(a.id)->>'username') developer_profile_username,
  coalesce(d.pricing_kind,'unknown') pricing_kind,coalesce(d.billing_model,'unknown') billing_model
from public.public_discoverable_apps a left join public.app_save_counts s on s.app_id=a.id
left join public.public_app_review_summary r on r.app_id=a.id
left join public.public_marketplace_details d on d.app_id=a.id;
create or replace function public.get_public_member_apps(p_username text,p_offset integer default 0)
returns setof public.public_apps language sql stable security definer set search_path='' as $$
  select a.* from public.public_apps a join public.public_discoverable_apps eligible on eligible.id=a.id
  where exists(select 1 from public.app_owners o join public.member_public_profiles p on p.user_id=o.user_id
    where o.app_id=a.id and o.revoked_at is null and p.username=lower(p_username))
  order by a.name,a.id limit 25 offset greatest(coalesce(p_offset,0),0);
$$;

-- Private follows: a row is explicit consent to in-app update notifications.
create table public.marketplace_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  target text not null check(target ~ '^(app:[0-9a-f-]{36}|developer:[a-z0-9_]{2,30})$'),
  created_at timestamptz not null default now(),primary key(user_id,target)
);
create index marketplace_follows_target_idx on public.marketplace_follows(target);
alter table public.marketplace_follows enable row level security;
revoke all on public.marketplace_follows from public,anon,authenticated;
grant select,delete on public.marketplace_follows to authenticated;
grant all on public.marketplace_follows to service_role;
create policy "Own follow preferences" on public.marketplace_follows for select to authenticated using(user_id=(select auth.uid()));
create policy "Unsubscribe own follows" on public.marketplace_follows for delete to authenticated using(user_id=(select auth.uid()));
create function public.set_marketplace_follow(p_target text,p_follow boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_follow is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not p_follow then delete from public.marketplace_follows where user_id=auth.uid() and target=p_target; return; end if;
  if not ((p_target like 'app:%' and exists(select 1 from public.public_discoverable_apps where 'app:'||id=p_target))
    or (p_target like 'developer:%' and exists(select 1 from public.member_public_profiles where 'developer:'||username=p_target))) then
    raise exception 'Public follow target required';
  end if;
  insert into public.marketplace_follows(user_id,target) values(auth.uid(),p_target) on conflict do nothing;
end $$;
revoke all on function public.set_marketplace_follow(text,boolean) from public,anon;
grant execute on function public.set_marketplace_follow(text,boolean) to authenticated;

create table public.app_releases (
  id uuid primary key,app_id uuid not null references app_graph.apps(id) on delete cascade,
  version text not null check(length(version) between 1 and 80),
  notes text not null check(length(notes) between 20 and 2000),
  created_at timestamptz not null default now()
);
create index app_releases_app_idx on public.app_releases(app_id,created_at desc);
alter table public.app_releases enable row level security;
revoke all on public.app_releases from public,anon,authenticated;
grant select on public.app_releases to anon,authenticated;
grant all on public.app_releases to service_role;
create policy "Public eligible release notes" on public.app_releases for select to anon,authenticated
  using(exists(select 1 from public.public_discoverable_apps where id=app_id));
create function public.publish_app_release(p_id uuid,p_app_id uuid,p_version text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare inserted_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.app_owners where app_id=p_app_id and user_id=auth.uid()
    and revoked_at is null and verification_level='domain_verified') then
    raise exception 'Verified app ownership required' using errcode='42501';
  end if;
  if not exists(select 1 from public.public_discoverable_apps where id=p_app_id) then raise exception 'Eligible listing required'; end if;
  if exists(select 1 from public.app_releases where id=p_id and
    (app_id<>p_app_id or version<>btrim(p_version) or notes<>btrim(p_notes))) then raise exception 'Release mismatch'; end if;
  insert into public.app_releases(id,app_id,version,notes) values(p_id,p_app_id,btrim(p_version),btrim(p_notes))
    on conflict do nothing returning id into inserted_id;
  if inserted_id is null then return; end if;
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
  select distinct f.user_id,'app',left('App update: '||a.name,180),left(btrim(p_notes),500),'/apps/'||p_app_id,
    'release:'||p_id from public.marketplace_follows f cross join public.public_discoverable_apps a
  where a.id=p_app_id and f.user_id<>auth.uid() and (f.target='app:'||p_app_id or f.target in
    (select 'developer:'||p.username from public.app_owners o join public.member_public_profiles p on p.user_id=o.user_id
      where o.app_id=p_app_id and o.revoked_at is null and o.verification_level='domain_verified'))
  on conflict(user_id,event_key) do nothing;
end $$;
revoke all on function public.publish_app_release(uuid,uuid,text,text) from public,anon;
grant execute on function public.publish_app_release(uuid,uuid,text,text) to authenticated;

-- Historical purchase attribution survives refunds. It does not assert verified usage.
-- Reuse existing webhook-backed evidence, not mutable status alone: an expired
-- checkout or failed first invoice must never become a verified purchase.
-- Future subscription evidence carries an exact transaction_id. Legacy events
-- without that binding are deliberately not inferred/backfilled from access.
create index marketplace_paid_entitlement_event_idx on public.connect_entitlement_events((detail->>'transaction_id'))
  where event_type in ('invoice.paid','checkout.session.completed') and detail->>'status'='active';
create index marketplace_refund_event_idx on public.connect_webhook_events
  ((coalesce(detail->>'transaction_id',detail->>'purchase_id')),event_created_at)
  where processing_result='applied' and detail->>'status'='refunded';
create function app_graph.marketplace_transaction_paid(p_transaction_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.connect_transactions t
    where t.id=p_transaction_id and (
      exists(select 1 from public.connect_purchase_grants g where g.purchase_id=t.id
        and g.user_id=t.user_id and g.client_id=t.client_id and g.product_id=t.product_id)
      or exists(select 1 from public.connect_entitlements e join public.connect_entitlement_events v on v.entitlement_id=e.id
        where v.detail->>'transaction_id'=t.id::text and e.user_id=t.user_id and e.client_id=t.client_id and e.product_id=t.product_id
          and v.event_type in ('invoice.paid','checkout.session.completed') and v.detail->>'status'='active')));
$$;
revoke all on function app_graph.marketplace_transaction_paid(uuid) from public,anon,authenticated;
grant execute on function app_graph.marketplace_transaction_paid(uuid) to service_role;
create function public.get_app_review_purchase_labels(p_app_id uuid) returns table(review_id uuid,purchase_label text)
language sql stable security definer set search_path='' as $$
  select r.id,case when bool_or(t.status='refunded') then 'Verified purchase · refunded' else 'Verified purchase' end
  from app_graph.app_reviews r join public.public_discoverable_apps a on a.id=r.app_id
  join public.rocket_oauth_clients c on c.app_id=r.app_id and c.environment='production'
  join public.connect_transactions t on t.client_id=c.client_id and t.user_id=r.user_id
  join public.connect_products p on p.id=t.product_id and p.client_id=c.client_id
  where r.app_id=p_app_id and r.status='published' and app_graph.marketplace_transaction_paid(t.id)
  group by r.id;
$$;
revoke all on function public.get_app_review_purchase_labels(uuid) from public;
grant execute on function public.get_app_review_purchase_labels(uuid) to anon,authenticated;
create table public.app_review_responses (
  review_id uuid primary key references app_graph.app_reviews(id) on delete cascade,
  body text not null check(length(body) between 10 and 1000),updated_at timestamptz not null default now()
);
alter table public.app_review_responses enable row level security;
revoke all on public.app_review_responses from public,anon,authenticated;
grant select on public.app_review_responses to anon,authenticated;
grant all on public.app_review_responses to service_role;
create policy "Published review responses" on public.app_review_responses for select to anon,authenticated
  using(exists(select 1 from public.public_app_reviews where id=review_id));
create function public.respond_app_review(p_review_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from app_graph.app_reviews r join public.app_owners o on o.app_id=r.app_id
    join public.public_discoverable_apps a on a.id=r.app_id where r.id=p_review_id and r.status='published'
    and o.user_id=auth.uid() and o.revoked_at is null and o.verification_level='domain_verified') then
    raise exception 'Verified app ownership required' using errcode='42501';
  end if;
  if p_body is null then delete from public.app_review_responses where review_id=p_review_id;
  else insert into public.app_review_responses(review_id,body) values(p_review_id,btrim(p_body))
    on conflict(review_id) do update set body=excluded.body,updated_at=now(); end if;
end $$;
revoke all on function public.respond_app_review(uuid,text) from public,anon;
grant execute on function public.respond_app_review(uuid,text) to authenticated;

-- Reports stay private and are processed inside the existing Admin Ops page.
create table public.app_reports (
  id uuid primary key default gen_random_uuid(),app_id uuid not null references app_graph.apps(id),
  user_id uuid not null references auth.users(id),reason text not null check(length(reason) between 10 and 500),
  status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now(),
  unique(app_id,user_id)
);
create index app_reports_queue_idx on public.app_reports(status,created_at);
alter table public.app_reports enable row level security;
revoke all on public.app_reports from public,anon,authenticated;
grant all on public.app_reports to service_role;
create function public.report_marketplace_app(p_app_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.public_apps where id=p_app_id) then raise exception 'Public app required'; end if;
  insert into public.app_reports(app_id,user_id,reason) values(p_app_id,auth.uid(),btrim(p_reason))
    on conflict(app_id,user_id) do update set reason=excluded.reason,status='open';
end $$;
revoke all on function public.report_marketplace_app(uuid,text) from public,anon;
grant execute on function public.report_marketplace_app(uuid,text) to authenticated;
create function public.moderate_app_reports(p_resolve uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_rocket_admin(),false) then raise exception 'Admin access denied' using errcode='42501'; end if;
  if p_resolve is not null then
    update public.app_reports set status='resolved' where id=p_resolve;
    insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id)
      values(auth.uid(),'resolve_app_report','report',p_resolve::text);
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (select id,app_id,reason,status,created_at
    from public.app_reports where status='open' order by created_at limit 100) r),'[]'::jsonb);
end $$;
revoke all on function public.moderate_app_reports(uuid) from public,anon;
grant execute on function public.moderate_app_reports(uuid) to authenticated;

-- Click signals are not installs or ownership. Anonymous ingestion stays behind an Edge Function.
create table app_graph.marketplace_clicks (
  id bigint generated always as identity primary key,app_id uuid not null references app_graph.apps(id),
  source text not null check(source in ('direct','rocket_badge','rocket_share')),
  visitor_hash text not null,click_day date not null default (now() at time zone 'utc')::date,
  unique(app_id,visitor_hash,click_day)
);
alter table app_graph.marketplace_clicks enable row level security;
revoke all on app_graph.marketplace_clicks from public,anon,authenticated;
grant all on app_graph.marketplace_clicks to service_role;
grant usage,select on sequence app_graph.marketplace_clicks_id_seq to service_role;
create function public.record_marketplace_click(p_app_id uuid,p_source text,p_visitor_hash text) returns boolean
language sql security invoker set search_path='' as $$
  with inserted as (insert into app_graph.marketplace_clicks(app_id,source,visitor_hash)
  select id,p_source,p_visitor_hash from public.public_discoverable_apps
  where id=p_app_id and p_visitor_hash ~ '^[0-9a-f]{64}$' on conflict do nothing returning id)
  select exists(select 1 from inserted);
$$;
revoke all on function public.record_marketplace_click(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_marketplace_click(uuid,text,text) to service_role;

-- Extend the SAME owner analytics RPC without exposing individual buyers.
alter function public.get_owned_app_rocket_analytics(uuid,uuid,integer,integer) rename to marketplace_previous_owned_analytics;
revoke all on function public.marketplace_previous_owned_analytics(uuid,uuid,integer,integer) from public,anon,authenticated;
create function public.get_owned_app_rocket_analytics(p_app_id uuid,p_user_id uuid,p_days integer default 30,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; since timestamptz; commerce jsonb;
begin
  result:=public.marketplace_previous_owned_analytics(p_app_id,p_user_id,p_days,p_page);
  since:=((now() at time zone 'utc')::date-(p_days-1))::timestamp at time zone 'utc';
  select jsonb_build_object('outbound_clicks',(select count(*) from app_graph.marketplace_clicks where app_id=p_app_id and click_day>=since::date),
    'checkout_starts',(select count(*) from public.connect_checkout_attempts t join public.rocket_oauth_clients c using(client_id)
      join public.connect_products p on p.id=t.product_id and p.client_id=c.client_id
      where c.app_id=p_app_id and c.environment='production' and p.developer_user_id=p_user_id and t.created_at>=since),
    'verified_purchases',(select count(*) from public.connect_transactions t join public.rocket_oauth_clients c using(client_id)
      join public.connect_products p on p.id=t.product_id and p.client_id=c.client_id
      where c.app_id=p_app_id and c.environment='production' and p.developer_user_id=p_user_id and t.created_at>=since
        and app_graph.marketplace_transaction_paid(t.id)),
    'refunds',(select count(*) from public.connect_transactions t join public.rocket_oauth_clients c using(client_id)
      join public.connect_products p on p.id=t.product_id and p.client_id=c.client_id
      where c.app_id=p_app_id and c.environment='production' and p.developer_user_id=p_user_id
        and app_graph.marketplace_transaction_paid(t.id) and exists(select 1 from public.connect_webhook_events w
          where w.processing_result='applied' and w.event_created_at>=since and w.detail->>'status'='refunded'
            and coalesce(w.detail->>'transaction_id',w.detail->>'purchase_id')=t.id::text)),
    'outbound_sources',coalesce((select jsonb_object_agg(source,n) from (select source,count(*) n from app_graph.marketplace_clicks
      where app_id=p_app_id and click_day>=since::date group by source) s),'{}'::jsonb)) into commerce;
  return result||jsonb_build_object('commerce',commerce);
end $$;
revoke all on function public.get_owned_app_rocket_analytics(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_owned_app_rocket_analytics(uuid,uuid,integer,integer) to service_role;
notify pgrst,'reload schema';
