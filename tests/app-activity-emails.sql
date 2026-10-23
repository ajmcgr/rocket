-- Run after the migration inside BEGIN/ROLLBACK. pg_net dispatches only after
-- commit, so these fixtures never send mail or leave production rows behind.
insert into auth.users(id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-000000000001','activity-owner@example.invalid',now()),
  ('a0000000-0000-4000-8000-000000000002','activity-actor@example.invalid',now()),
  ('a0000000-0000-4000-8000-000000000003','activity-other@example.invalid',now());
insert into app_graph.apps(id,seed_source_type,seed_source_external_id,name,website_url,canonical_host,source_hash,slug,is_public) values
  ('b0000000-0000-4000-8000-000000000001','website','activity-test-1','Activity test','https://example.invalid/activity','example.invalid','test','activity-test-1',true),
  ('b0000000-0000-4000-8000-000000000002','website','activity-test-2','Unclaimed test','https://example.invalid/unclaimed','example.invalid','test','activity-test-2',true),
  ('b0000000-0000-4000-8000-000000000003','website','activity-test-3','Unmanaged test','https://example.invalid/unmanaged','example.invalid','test','activity-test-3',true);
insert into public.app_claims(id,app_id,user_id,method,status) values
  ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','existing_relationship','verified');
insert into public.app_owners(app_id,user_id,claim_id,verification_level) values
  ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','claimed');
insert into public.app_submission_details(app_id,submitted_by,details) values
  ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','{}');
insert into public.app_activity_email_preferences(user_id,enabled) values
  ('a0000000-0000-4000-8000-000000000001',true),
  ('a0000000-0000-4000-8000-000000000002',true);
insert into public.user_collections(id,owner_id,name,visibility) values
  ('d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','Secret private collection','private'),
  ('d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','Public collection','public'),
  ('d0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','Own collection','private');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare changed integer; begin
  if (select count(*) from public.app_activity_email_preferences) <> 1 then raise exception 'Preference RLS read leaked'; end if;
  update public.app_activity_email_preferences set enabled=false where user_id='a0000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Preference RLS write leaked'; end if;
  begin
    insert into public.saved_apps(user_id,app_id) values('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001');
    raise exception 'Cross-user save allowed';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.saved_apps(user_id,app_id) values
  ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000003');
insert into public.collection_apps(collection_id,app_id) values
  ('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001');
delete from public.saved_apps where user_id='a0000000-0000-4000-8000-000000000002' and app_id='b0000000-0000-4000-8000-000000000001';
insert into public.saved_apps(user_id,app_id) values('a0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001');
reset role;
do $$ declare q sharing_private.email_queue; leased jsonb; begin
  if (select count(*) from sharing_private.email_queue where kind in ('app_saved','app_collected') and context->>'app_id'='b0000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Save/collection deduplication failed'; end if;
  if (select count(*) from sharing_private.email_queue where kind='app_saved' and context->>'app_id'='b0000000-0000-4000-8000-000000000002') <> 1 then raise exception 'Submitter notification missing'; end if;
  if exists(select 1 from sharing_private.email_queue where kind in ('app_saved','app_collected') and context->>'app_id'='b0000000-0000-4000-8000-000000000003') then raise exception 'Unmanaged app notification'; end if;
  if exists(select 1 from sharing_private.email_queue where context->>'app_id'='b0000000-0000-4000-8000-000000000001' and (context::text like '%Secret%' or context::text like '%activity-actor%' or context ? 'collection_id')) then raise exception 'Private activity leaked into email context'; end if;
  select * into q from sharing_private.email_queue where kind='app_saved' and context->>'app_id'='b0000000-0000-4000-8000-000000000001';
  if public.lease_sharing_email(q.id,repeat('0',64)) is not null then raise exception 'Invalid capability accepted'; end if;
  leased := public.lease_sharing_email(q.id,q.dispatch_token);
  if leased->>'recipient' <> 'activity-owner@example.invalid' or leased->>'kind' <> 'app_saved' then raise exception 'Wrong recipient or email kind'; end if;
  if public.lease_sharing_email(q.id,q.dispatch_token) is not null then raise exception 'Concurrent lease accepted'; end if;
end $$;

-- Self-saves and collections do not email their owner.
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into public.saved_apps(user_id,app_id) values('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001');
insert into public.collection_apps(collection_id,app_id) values('d0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001');
update public.app_activity_email_preferences set enabled=false where user_id='a0000000-0000-4000-8000-000000000001';
reset role;
do $$ declare q sharing_private.email_queue; begin
  if (select count(*) from sharing_private.email_queue where kind in ('app_saved','app_collected') and context->>'app_id'='b0000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Self activity sent'; end if;
  select * into q from sharing_private.email_queue where kind='app_collected' and context->>'app_id'='b0000000-0000-4000-8000-000000000001';
  if public.lease_sharing_email(q.id,q.dispatch_token) is not null then raise exception 'Queued opt-out ignored'; end if;
  if (select attempts from sharing_private.email_queue where id=q.id) <> 8 then raise exception 'Cancelled email will keep retrying'; end if;
end $$;
insert into public.saved_apps(user_id,app_id) values('a0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from sharing_private.email_queue where kind in ('app_saved','app_collected') and context->>'app_id'='b0000000-0000-4000-8000-000000000001') <> 2 then raise exception 'Opt-out enqueue ignored'; end if;
end $$;
update public.app_activity_email_preferences set enabled=true where user_id='a0000000-0000-4000-8000-000000000001';
update public.app_owners set revoked_at=now() where app_id='b0000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from sharing_private.app_activity_recipients('b0000000-0000-4000-8000-000000000001')) then raise exception 'Revoked owner remains eligible'; end if;
end $$;
insert into public.rocket_outreach_suppressions(email,reason) values('activity-owner@example.invalid','complained');
do $$ declare q sharing_private.email_queue; begin
  select * into q from sharing_private.email_queue where kind='app_saved' and context->>'app_id'='b0000000-0000-4000-8000-000000000002';
  if public.lease_sharing_email(q.id,q.dispatch_token) is not null then raise exception 'Suppression ignored'; end if;
  if has_table_privilege('anon','public.app_activity_email_preferences','select')
    or has_function_privilege('authenticated','public.lease_sharing_email(uuid,text)','execute')
    or has_function_privilege('authenticated','sharing_private.app_activity_recipients(uuid)','execute') then raise exception 'Private email access exposed'; end if;
end $$;
