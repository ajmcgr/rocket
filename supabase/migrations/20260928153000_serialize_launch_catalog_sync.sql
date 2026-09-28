-- Keep two independently triggered daily runs from withdrawing each other's sources.
create unique index app_import_one_running_launch_idx on app_graph.app_import_jobs (source_type)
  where status = 'running';

create or replace function public.start_launch_app_import(p_expected_count integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_existing_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(20260928, 1);
  update app_graph.app_import_jobs set status = 'failed', finished_at = now(),
    error = 'Abandoned import timed out'
    where source_type = 'launch' and status = 'running'
      and started_at < now() - interval '2 hours';
  if exists (select 1 from app_graph.app_import_jobs where source_type = 'launch' and status = 'running') then
    raise exception 'Launch import already running';
  end if;
  if p_expected_count < 4000 then raise exception 'Launch catalogue unexpectedly small'; end if;
  select count(*) into v_existing_count from app_graph.app_sources
    where source_type = 'launch' and status = 'active';
  if v_existing_count > 0 and p_expected_count < v_existing_count * 0.95 then
    raise exception 'Launch catalogue shrank from % to %; review before syncing', v_existing_count, p_expected_count;
  end if;
  insert into app_graph.app_import_jobs(source_type, status, expected_count)
  values ('launch', 'running', p_expected_count) returning id into v_id;
  return v_id;
end;
$$;

create function public.fail_launch_app_import(p_run_id uuid, p_error text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update app_graph.app_import_jobs set status = 'failed', finished_at = now(),
    error = left(coalesce(p_error, 'Import failed'), 500)
    where id = p_run_id and source_type = 'launch' and status = 'running';
end;
$$;
revoke all on function public.fail_launch_app_import(uuid,text) from public, anon, authenticated;
grant execute on function public.fail_launch_app_import(uuid,text) to service_role;
