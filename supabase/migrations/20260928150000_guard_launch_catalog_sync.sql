-- A partial Launch response must never silently withdraw a large part of the catalogue.
create or replace function public.start_launch_app_import(p_expected_count integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_existing_count integer;
begin
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
