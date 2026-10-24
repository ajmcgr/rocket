-- Execute inside BEGIN/ROLLBACK. No test events or identity changes persist.
do $$
declare event_id uuid := gen_random_uuid(); counted boolean; p text; snapshot jsonb;
  cutoff timestamptz; click_cutoff date; expected bigint; admin_id uuid;
begin
  if has_function_privilege('anon','public.record_discovery_search(uuid,text,text)','execute')
    or has_function_privilege('authenticated','public.record_discovery_search(uuid,text,text)','execute')
    or has_table_privilege('authenticated','app_graph.discovery_search_events','select')
    or has_table_privilege('anon','app_graph.discovery_search_events','insert')
    or not has_function_privilege('service_role','public.record_discovery_search(uuid,text,text)','execute') then
    raise exception 'Search event storage or recorder is exposed';
  end if;
  if not (select relrowsecurity from pg_class where oid='app_graph.discovery_search_events'::regclass) then
    raise exception 'Search table RLS missing';
  end if;
  if not public.record_discovery_search(event_id,'header',repeat('e',64)) then raise exception 'First search not counted'; end if;
  if public.record_discovery_search(event_id,'header',repeat('e',64)) then raise exception 'Retry counted twice'; end if;
  for n in 2..60 loop
    if not public.record_discovery_search(gen_random_uuid(),'discover',repeat('e',64)) then raise exception 'Search unexpectedly rate limited'; end if;
  end loop;
  if public.record_discovery_search(gen_random_uuid(),'homepage',repeat('e',64)) then raise exception 'Rate limit bypassed'; end if;
  begin
    perform public.record_discovery_search(gen_random_uuid(),'invalid',repeat('e',64));
    raise exception 'Bad source accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid search event' then raise; end if; end;

  insert into app_graph.discovery_search_events(event_id,source,visitor_hash,created_at)
    select gen_random_uuid(),'homepage',repeat('d',64),now()-make_interval(days=>n) from unnest(array[2,10,40]) n;
  insert into app_graph.marketplace_clicks(app_id,source,visitor_hash,click_day)
    select (select id from public.public_discoverable_apps limit 1),'direct',repeat('c',64),
      (now() at time zone 'UTC')::date-n from unnest(array[0,2,10,40]) n;

  select id into strict admin_id from auth.users where lower(email)='alex@alexmacgregor.com' and email_confirmed_at is not null and deleted_at is null;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  foreach p in array array['all','today','7d','30d'] loop
    cutoff := case p when 'today' then date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'
      when '7d' then now()-interval '7 days' when '30d' then now()-interval '30 days' else null end;
    click_cutoff := (now() at time zone 'UTC')::date-case p when '7d' then 6 when '30d' then 29 else 0 end;
    snapshot := public.rocket_admin_snapshot('home',p);
    select count(*) into expected from app_graph.discovery_search_events where cutoff is null or created_at>=cutoff;
    if (snapshot#>>'{discovery,searches}')::bigint <> expected then raise exception 'Wrong search count for %',p; end if;
    select count(*) into expected from app_graph.marketplace_clicks where p='all' or click_day>=click_cutoff;
    if (snapshot#>>'{discovery,outbound_clicks}')::bigint <> expected then raise exception 'Wrong click count for %',p; end if;
    if public.rocket_admin_snapshot('metrics',p)#>'{discovery}' <> snapshot->'discovery' then raise exception 'Overview/metrics mismatch'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
end;
$$;
set local role authenticated;
do $$
begin
  begin
    perform public.rocket_admin_snapshot('home','all');
    raise exception 'Non-admin accessed dashboard';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_discovery_search(gen_random_uuid(),'header',repeat('b',64));
    raise exception 'User wrote search directly';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'PASS: counts/periods, idempotency, abuse limit, RLS, private storage and admin authorization' as result;
