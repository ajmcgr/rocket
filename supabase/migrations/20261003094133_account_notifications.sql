-- Durable inbox. Backend events cannot be fabricated by browser clients.
create table public.account_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('asset','export','project','system','app','monetize','billing')),
  title text not null check (char_length(title) between 1 and 180),
  body text check (char_length(body) <= 2000),
  href text check (href ~ '^/[^/]' and href !~ '[\\[:cntrl:]]'),
  event_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  unique (user_id,event_key)
);
create index account_notifications_inbox_idx on public.account_notifications(user_id,created_at desc)
  where dismissed_at is null;
alter table public.account_notifications enable row level security;
revoke all on public.account_notifications from public,anon,authenticated;
grant select on public.account_notifications to authenticated;
grant insert (user_id,kind,title,body,href) on public.account_notifications to authenticated;
grant update (read_at,dismissed_at) on public.account_notifications to authenticated;
grant all on public.account_notifications to service_role;
create policy "Own notification inbox" on public.account_notifications for select to authenticated
  using ((select auth.uid())=user_id);
create policy "Own local creation events" on public.account_notifications for insert to authenticated
  with check ((select auth.uid())=user_id and event_key is null and kind in ('asset','export','project','system'));
create policy "Own notification read state" on public.account_notifications for update to authenticated
  using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Not an RPC: only trusted source-table triggers can execute this function.
create schema if not exists notification_private;
revoke all on schema notification_private from public,anon,authenticated;
create function notification_private.capture_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  n jsonb := to_jsonb(new); o jsonb := case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  recipient uuid; seller uuid; app uuid; client text; app_name text; label text;
  category text; title text; body text; href text; source_key text; watched text[];
begin
  -- Ignore ordinary sync timestamps, token refreshes and repeated webhook state.
  watched := case TG_TABLE_NAME
    when 'app_submission_details' then array['app_id']
    when 'app_owner_presentations' then array['display_name','description','logo_url','category','pricing_display','public_links']
    when 'app_jobs' then array['status']
    when 'app_claims' then array['status']
    when 'app_owners' then array['user_id','verification_level','revoked_at']
    when 'app_data_connections' then array['status']
    when 'app_revenue_connections' then array['status']
    when 'rocket_oauth_clients' then array['is_active','redirect_uris']
    when 'connect_developer_accounts' then array['status','charges_enabled','payouts_enabled','is_current']
    when 'connect_products' then array['is_active','integration_confirmed_at']
    when 'connect_transactions' then array['status','stripe_invoice_id']
    when 'rocket_developer_memberships' then array['status','cancel_at_period_end','current_period_end']
    when 'subscriptions' then array['status','plan','cancel_at_period_end','current_period_end']
    when 'payments' then array['status']
    when 'credit_transactions' then array['kind'] end;
  if TG_OP='UPDATE' and not exists (
    select 1 from unnest(watched) k where n->k is distinct from o->k
  ) then return new; end if;
  recipient := coalesce(n->>'user_id',n->>'owner_user_id',n->>'submitted_by',n->>'created_by',n->>'developer_user_id',n->>'updated_by')::uuid;
  app := (n->>'app_id')::uuid; client := n->>'client_id';
  if app is null and client is not null then
    select c.app_id,coalesce(recipient,c.created_by) into app,recipient
      from public.rocket_oauth_clients c where c.client_id=client;
  end if;
  if app is not null then select a.name into app_name from app_graph.apps a where a.id=app; end if;
  app_name := coalesce(app_name,'Your app');
  category := 'app'; href := '/your-apps';
  case TG_TABLE_NAME
    when 'app_submission_details' then
      title := 'App published'; body := app_name || ' is now listed on Rocket.';
      select '/apps/' || coalesce(a.slug,a.id::text) into href from app_graph.apps a where a.id=app;
    when 'app_jobs' then
      if n->>'status' not in ('failed','needs_review') then return new; end if;
      title := 'App submission needs attention'; body := 'Your submission could not be completed automatically. Review it or try manual submission.'; href := '/submit';
    when 'app_owner_presentations' then
      title := 'App listing updated'; body := app_name || ': your public listing changes were saved.';
    when 'app_claims' then
      if n->>'status' not in ('review','rejected') then return new; end if;
      title := case n->>'status' when 'review' then 'App claim under review' else 'App claim not approved' end;
      body := app_name || ': review your ownership claim in Your Apps.';
    when 'app_owners' then
      title := case when n->>'revoked_at' is not null then 'App ownership revoked'
        when n->>'verification_level'='domain_verified' then 'App ownership verified' else 'App claimed' end;
      body := app_name || ': your ownership status has changed.';
      if TG_OP='UPDATE' and o->>'user_id' is distinct from n->>'user_id' then
        insert into public.account_notifications(user_id,kind,title,body,href,event_key)
          values ((o->>'user_id')::uuid,'app','App ownership changed',app_name || ' is no longer assigned to your account.','/your-apps',
            'owner-transfer:' || app::text || ':' || clock_timestamp()::text);
      end if;
    when 'app_data_connections' then
      label := case n->>'provider' when 'ga4' then 'Google Analytics' when 'posthog' then 'PostHog' else 'Analytics' end;
      title := label || case n->>'status' when 'active' then ' connected' when 'error' then ' needs attention' when 'disconnected' then ' disconnected' else ' setup started' end;
      body := app_name || ': manage the connection in Your Apps.';
    when 'app_revenue_connections' then
      title := 'Revenue verification ' || case n->>'status' when 'active' then 'connected' when 'error' then 'needs attention' else 'disconnected' end;
      body := 'Manage your Stripe revenue verification connection in Your Apps.';
    when 'rocket_oauth_clients' then
      category := 'monetize'; href := '/rocket-id' || case when app is not null then '?app=' || app::text else '' end;
      title := case when TG_OP='INSERT' then 'Rocket ID configured' when (n->>'is_active')::boolean then 'Rocket ID configuration updated' else 'Rocket ID disabled' end;
      body := app_name || ': review your sign-in integration. Configuration alone does not prove production readiness.';
    when 'connect_developer_accounts' then
      category := 'monetize'; href := '/buy-with-rocket';
      title := case when n->>'is_current'='false' then 'Merchant account replaced'
        when n->>'status'='active' and n->>'charges_enabled'='true' and n->>'payouts_enabled'='true' then 'Merchant account ready'
        when n->>'status'='disabled' then 'Merchant account needs attention' else 'Merchant onboarding updated' end;
      body := 'Review Stripe onboarding and activation requirements in Buy with Rocket.';
    when 'connect_products' then
      category := 'monetize'; href := '/buy-with-rocket' || case when app is not null then '?app=' || app::text else '' end;
      title := case when n->>'is_active'='true' then 'Buy with Rocket plan enabled' when TG_OP='INSERT' then 'Access plan created' else 'Access plan updated' end;
      body := app_name || ': review your access plan and integration status.';
    when 'connect_transactions' then
      if n->>'status'='pending' then return new; end if;
      category := 'monetize'; href := '/library';
      title := case n->>'status' when 'paid' then 'App payment confirmed' when 'refunded' then 'App payment refunded'
        when 'past_due' then 'App payment needs attention' when 'disputed' then 'App payment disputed'
        when 'canceling' then 'App subscription cancellation scheduled' when 'expired' then 'App subscription ended' else 'App payment failed' end;
      body := app_name || ': review your purchase and access status in Library.';
      select coalesce(p.developer_user_id,c.created_by) into seller from public.connect_products p
        join public.rocket_oauth_clients c on c.client_id=p.client_id where p.id=(n->>'product_id')::uuid;
    when 'rocket_developer_memberships','subscriptions' then
      category := 'billing'; label := case TG_TABLE_NAME when 'rocket_developer_memberships' then 'Rocket Developer' else 'Create plan' end;
      href := case TG_TABLE_NAME when 'rocket_developer_memberships' then '/settings/developer' else '/settings/billing' end;
      if TG_TABLE_NAME='subscriptions' and n->>'stripe_subscription_id' is null and n->>'plan'='free' and TG_OP='INSERT' then return new; end if;
      title := label || case when n->>'status' in ('past_due','unpaid','incomplete') then ' payment needs attention'
        when n->>'status' in ('canceled','incomplete_expired') then ' subscription ended'
        when n->>'cancel_at_period_end'='true' then ' cancellation scheduled'
        when TG_OP='UPDATE' and o->>'cancel_at_period_end'='true' then ' cancellation reversed'
        when TG_OP='UPDATE' and n->>'status'=o->>'status' and n->>'current_period_end' is distinct from o->>'current_period_end' then ' billing period updated'
        else ' subscription updated' end;
      body := 'Review your subscription status, invoices and payment method in Settings.';
    when 'payments' then
      category := 'billing'; href := '/settings/billing';
      title := case n->>'status' when 'succeeded' then 'Payment received' when 'paid' then 'Payment received' when 'refunded' then 'Payment refunded' else 'Payment status updated' end;
      body := 'Your Rocket payment status is ' || coalesce(n->>'status','updated') || '. Review billing for details.';
    when 'credit_transactions' then
      if n->>'kind' not in ('purchased','refunded') then return new; end if;
      category := 'billing'; href := '/settings/billing'; title := 'Create credits ' || (n->>'kind');
      body := (n->>'credits') || ' credits. Review your balance in Billing.';
    else return new;
  end case;
  if recipient is null then return new; end if;
  if category='monetize' and client is not null and exists (
    select 1 from public.rocket_oauth_clients c where c.client_id=client and c.environment <> 'production'
  ) then title := '[Test] ' || title; end if;
  source_key := TG_TABLE_NAME || ':' || coalesce(n->>'id',n->>'app_id',n->>'user_id') || ':' ||
    case when TG_OP='INSERT' then 'created' else clock_timestamp()::text end;
  insert into public.account_notifications(user_id,kind,title,body,href,event_key)
    values(recipient,category,title,body,href,source_key) on conflict (user_id,event_key) do nothing;
  if seller is not null and seller is distinct from recipient then
    insert into public.account_notifications(user_id,kind,title,body,href,event_key)
      values(seller,'monetize',title,app_name || ': a customer payment status changed.','/buy-with-rocket',source_key)
      on conflict(user_id,event_key) do nothing;
  end if;
  return new;
exception when others then
  -- An inbox issue must not prevent fulfillment or a verified Stripe update.
  -- Alert operators without logging private payment/customer details.
  raise warning 'Notification capture failed for %.% (%)',TG_TABLE_SCHEMA,TG_TABLE_NAME,SQLSTATE;
  return new;
end;
$$;
revoke all on function notification_private.capture_event() from public,anon,authenticated;
-- No historical backfill: a new inbox only receives real future activity.
do $$ declare t text; begin
  foreach t in array array['app_submission_details','app_owner_presentations','app_jobs','app_claims','app_owners',
    'app_data_connections','app_revenue_connections','rocket_oauth_clients','connect_developer_accounts',
    'connect_products','connect_transactions','rocket_developer_memberships','subscriptions','payments','credit_transactions'] loop
    execute format('create trigger account_notification_event after insert or update on public.%I for each row execute function notification_private.capture_event()',t);
  end loop;
end $$;
