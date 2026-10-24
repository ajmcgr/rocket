-- Run inside BEGIN/ROLLBACK. Fixtures and attribution never persist.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into auth.users(id,email,email_confirmed_at,created_at) values
 ('a2410000-0000-4000-8000-000000000001','growth-new@example.invalid',now(),now()-interval '20 seconds'),
 ('a2410000-0000-4000-8000-000000000002','growth-old@example.invalid',now(),now()-interval '30 days');
insert into app_graph.apps(id,seed_source_type,seed_source_external_id,name,website_url,canonical_host,source_hash,slug,is_public)
 values('b2410000-0000-4000-8000-000000000001','website','growth-test','Growth test','https://example.invalid/growth','example.invalid','test','growth-private-test',false);

do $$
declare target text; visit uuid:=gen_random_uuid(); expired uuid:=gen_random_uuid(); admin_id uuid; original jsonb; current_stats jsonb;
  raw_count bigint; event uuid:=gen_random_uuid(); u uuid:='a2410000-0000-4000-8000-000000000001';
begin
  if has_function_privilege('anon','public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid,timestamptz)','execute')
    or has_function_privilege('authenticated','public.record_rocket_growth_event(uuid,text,text,text,text,text,uuid,uuid,timestamptz)','execute')
    or has_table_privilege('authenticated','app_graph.rocket_growth_events','select') then raise exception 'Growth ledger exposed'; end if;
  select id::text into target from public.public_apps limit 1;
  set local role service_role;
  if not public.record_rocket_growth_event(visit,'referral_visit','app',target,null,repeat('a',64)) then raise exception 'Visit missing'; end if;
  if public.record_rocket_growth_event(visit,'referral_visit','app',target,null,repeat('a',64)) then raise exception 'Refresh duplicated visit'; end if;
  reset role;
  update app_graph.rocket_growth_events set created_at=now()-interval '30 seconds' where event_id=visit;
  set local role service_role;
  if public.record_rocket_growth_event(gen_random_uuid(),'referral_signup',null,null,null,repeat('a',64),'a2410000-0000-4000-8000-000000000002',visit,now()-interval '30 days') then raise exception 'Existing login counted as signup'; end if;
  perform public.record_rocket_growth_event(expired,'referral_visit','app',target,null,repeat('a',64));
  reset role;
  update app_graph.rocket_growth_events set created_at=now()-interval '8 days' where event_id=expired;
  set local role service_role;
  if public.record_rocket_growth_event(gen_random_uuid(),'referral_signup',null,null,null,repeat('a',64),u,expired,now()-interval '20 seconds') then raise exception 'Expired referral accepted'; end if;
  if public.record_rocket_growth_event(gen_random_uuid(),'referral_signup',null,null,null,repeat('a',64),u,gen_random_uuid(),now()-interval '20 seconds') then raise exception 'Fabricated visit counted'; end if;
  if not public.record_rocket_growth_event(event,'referral_signup',null,null,null,repeat('a',64),u,visit,now()-interval '20 seconds') then raise exception 'Confirmed referral signup missing'; end if;
  if public.record_rocket_growth_event(gen_random_uuid(),'referral_signup',null,null,null,repeat('a',64),u,visit,now()-interval '20 seconds') then raise exception 'Signup duplicated'; end if;
  if public.record_rocket_growth_event(gen_random_uuid(),'referral_visit','app','growth-private-test',null,repeat('a',64)) then raise exception 'Private app event accepted'; end if;
  if not public.record_rocket_growth_event(gen_random_uuid(),'share_action','app',target,'link',repeat('b',64)) then raise exception 'Share action missing'; end if;
  begin
    perform public.record_rocket_growth_event(gen_random_uuid(),'analytics_connected','app',target,null,repeat('b',64));
    raise exception 'Client fabricated verified outcome';
  exception when raise_exception then if sqlerrm<>'Invalid growth event' then raise; end if; end;
  reset role;
  select id into admin_id from auth.users where lower(email)='alex@alexmacgregor.com' and email_confirmed_at is not null;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  original:=public.rocket_admin_growth('today');
  insert into public.app_claims(id,app_id,user_id,method,status,verification_state,completed_at)
    values('e2410000-0000-4000-8000-000000000001','b2410000-0000-4000-8000-000000000001',u,'dns_txt','verified','domain_verified',now());
  insert into public.app_owners(app_id,user_id,claim_id,verification_level,verified_at)
    values('b2410000-0000-4000-8000-000000000001',u,'e2410000-0000-4000-8000-000000000001','domain_verified',now());
  current_stats:=public.rocket_admin_growth('today');
  if current_stats->'activated_developers'<>original->'activated_developers' then raise exception 'Ownership counted as a successful sync'; end if;

  insert into public.app_data_connections(id,app_id,owner_user_id,provider,status,property_id,stream_id,verified_hostname,time_zone,refresh_token_ciphertext,refresh_token_iv,last_successful_sync)
    values('c2410000-0000-4000-8000-000000000001','b2410000-0000-4000-8000-000000000001',u,'ga4','active','test','test','example.invalid','UTC','fixture','fixture',now());
  -- No metric points: a connected account alone is not verified activation.
  if public.rocket_admin_growth('today')->'activated_developers'<>original->'activated_developers' then raise exception 'Connection without successful evidence counted'; end if;
  insert into public.app_metric_points(app_id,connection_id,provider,metric_type,metric_date,metric_value,property_id,verified_hostname,time_zone,observed_through,verification_status)
    select 'b2410000-0000-4000-8000-000000000001','c2410000-0000-4000-8000-000000000001','ga4',metric,current_date,10,'test','example.invalid','UTC',now(),'verified' from unnest(array['active_users','sessions']) metric;
  current_stats:=public.rocket_admin_growth('today');
  if (current_stats->>'activated_developers')::int<>(original->>'activated_developers')::int+1
    or (current_stats->>'verified_analytics_connections')::int<>(original->>'verified_analytics_connections')::int+1 then raise exception 'Analytics evidence not deduplicated by connection/developer'; end if;

  insert into public.app_verified_revenue_connections(id,owner_user_id,provider,status,access_token_ciphertext,access_token_iv,last_successful_sync)
    values('d2410000-0000-4000-8000-000000000001',u,'revenuecat','active','fixture','fixture',now());
  insert into public.app_verified_revenue_points(app_id,connection_id,owner_user_id,provider,external_account_id,external_app_id,product_ids,mapping_version,metric_type,value_minor,currency,observed_at,calculation_version,source_environment)
    values('b2410000-0000-4000-8000-000000000001','d2410000-0000-4000-8000-000000000001',u,'revenuecat','fixture','fixture',array['fixture'],1,'subscription_mrr',100,'USD',now(),1,'sandbox');
  if public.rocket_admin_growth('today')->'verified_revenue_connections'<>original->'verified_revenue_connections' then raise exception 'Sandbox revenue counted'; end if;
  insert into public.app_verified_revenue_points(app_id,connection_id,owner_user_id,provider,external_account_id,external_app_id,product_ids,mapping_version,metric_type,value_minor,currency,observed_at,calculation_version,source_environment)
    select 'b2410000-0000-4000-8000-000000000001','d2410000-0000-4000-8000-000000000001',u,'revenuecat','fixture','fixture',array['fixture'],1,metric,100,'USD',now(),1,'production' from unnest(array['subscription_mrr','gross_revenue_30d']) metric;
  current_stats:=public.rocket_admin_growth('today');
  if (current_stats->>'verified_revenue_connections')::int<>(original->>'verified_revenue_connections')::int+1
    or (current_stats->>'activated_developers')::int<>(original->>'activated_developers')::int+1 then raise exception 'Revenue activation duplicated or missing'; end if;
  if not ((current_stats->>'referred_developers_with_claims')::int>=1) then raise exception 'Successful referred owner claim missing'; end if;
  if public.rocket_admin_snapshot('home','today')->'growth'<>current_stats then raise exception 'Admin integration mismatch'; end if;
  perform public.rocket_admin_growth('all'); perform public.rocket_admin_growth('7d'); perform public.rocket_admin_growth('30d');
  perform set_config('request.jwt.claim.sub','a2410000-0000-4000-8000-000000000001',true);
end;
$$;
set local role authenticated;
do $$ begin
  begin perform public.rocket_admin_growth('all'); raise exception 'Non-admin read growth'; exception when insufficient_privilege then null; end;
  begin perform 1 from app_graph.rocket_growth_events; raise exception 'Non-admin read ledger'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'PASS: authoritative outcomes, sandbox/private guards, referral chain, idempotency and admin isolation' as result;
