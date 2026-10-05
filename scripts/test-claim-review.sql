\set ON_ERROR_STOP on
-- Run only against an isolated disposable PostgreSQL database, not production.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema app_graph; create schema extensions; create schema net; create schema cron;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table app_graph.apps(id uuid primary key,name text,website_url text,canonical_host text,claim_state text,updated_at timestamptz);
create table public.profiles(user_id uuid,full_name text);
create table public.app_claims(id uuid primary key default gen_random_uuid(),app_id uuid references app_graph.apps,user_id uuid references auth.users,method text,status text,verification_state text default 'unverified',created_at timestamptz default now(),completed_at timestamptz,rejected_at timestamptz,revoked_at timestamptz,review_reason text,unique(app_id,user_id,method));
create table public.app_owners(app_id uuid primary key,user_id uuid,claim_id uuid,verification_level text,revoked_at timestamptz);
create table public.account_notifications(user_id uuid,kind text,title text,body text,href text,event_key text,unique(user_id,event_key));
create table public.rocket_admin_audit(admin_user_id uuid,action text,target_type text,target_id text,context jsonb,created_at timestamptz default now());
create function public.is_rocket_admin() returns boolean language sql as $$select exists(select 1 from auth.users where id=auth.uid() and email='alex@alexmacgregor.com' and email_confirmed_at is not null and deleted_at is null)$$;
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create table net.http_request_queue(id bigint);
create table net._http_response(id bigint);
\ir ../supabase/migrations/20261005035744_manual_claim_review_delivery.sql
-- Use the actual existing admin decision implementation, without unrelated DDL.
\ir test-claim-admin-action.sql
insert into auth.users values ('00000000-0000-4000-8000-000000000001','alex@alexmacgregor.com',now(),null),('00000000-0000-4000-8000-000000000002','requester@example.com',now(),null),('00000000-0000-4000-8000-000000000003','other@example.com',now(),null);
insert into app_graph.apps(id,name,website_url,canonical_host) values ('00000000-0000-4000-8000-000000000010','Test','https://example.com','example.com'),('00000000-0000-4000-8000-000000000011','Reject test','https://example.org','example.org');
do $$declare first jsonb; second jsonb; claim uuid; job claim_private.email_queue; result jsonb;
begin
  first:=public.request_manual_app_review('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','Public evidence; SECRET');
  second:=public.request_manual_app_review('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','duplicate');
  assert first->>'claim_id'=second->>'claim_id';
  assert (select count(*)=1 from public.app_claims);
  assert (select count(*)=2 from claim_private.email_queue);
  assert (select count(*)=1 from public.account_notifications);
  assert not exists(select 1 from claim_private.email_queue where context::text like '%SECRET%');
  select * into job from claim_private.email_queue limit 1;
  assert public.lease_claim_email(job.id,'wrong') is null;
  assert public.lease_claim_email(job.id,job.dispatch_token) is not null;
  assert public.lease_claim_email(job.id,job.dispatch_token) is null;
  perform public.finish_claim_email(job.id,job.dispatch_token,'resend-test',null);
  assert public.lease_claim_email(job.id,job.dispatch_token) is null;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  begin perform public.rocket_admin_action('approve_claim',(first->>'claim_id')::uuid,'Attempted unauthorized approval'); raise exception 'Authorization bypass'; exception when insufficient_privilege then null; end;
  begin perform public.rocket_admin_claims(null); raise exception 'Admin data leaked'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  perform public.rocket_admin_action('approve_claim',(first->>'claim_id')::uuid,'Independently checked ownership relationship');
  assert exists(select 1 from public.app_owners where verification_level='claimed');
  assert exists(select 1 from public.app_claims where status='verified' and verification_state='credible' and completed_at is not null);
  assert exists(select 1 from public.rocket_admin_audit where admin_user_id=auth.uid() and action='approve_claim' and created_at is not null);
  assert exists(select 1 from claim_private.email_queue where kind='approved');
  second:=public.request_manual_app_review('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011',null);
  perform public.rocket_admin_action('reject_claim',(second->>'claim_id')::uuid,'Ownership evidence is insufficient');
  result:=public.request_manual_app_review('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011','repeat');
  assert result->>'status'='rejected';
  assert exists(select 1 from claim_private.email_queue where kind='rejected');
  assert (select count(*)=2 from public.rocket_admin_audit);
  assert not has_function_privilege('authenticated','public.request_manual_app_review(uuid,uuid,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.lease_claim_email(uuid,text)','EXECUTE');
  assert not has_schema_privilege('authenticated','claim_private','USAGE');
  raise notice 'PASS: idempotent request, queue secrecy/lease, receipt, approve/reject emails, terminal-state protection, authorization and audit';
end; $$;
