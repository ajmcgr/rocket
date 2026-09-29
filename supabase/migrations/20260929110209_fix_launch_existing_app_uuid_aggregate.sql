-- UUID has no built-in min(uuid) aggregate. The Slice 2 wrapper only needs
-- an app ID when there is exactly one canonical-URL match.
create or replace function public.sync_launch_app_batch(p_run_id uuid, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_source app_graph.app_sources%rowtype;
  v_app_id uuid; v_count integer; v_url text; v_website text; v_external text;
begin
  if not exists (select 1 from app_graph.app_import_jobs
    where id = p_run_id and status = 'running') then raise exception 'Import run is not active'; end if;
  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'Batch must contain at most 100 records'; end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    v_url := v_item->>'source_url';
    v_website := v_item->>'website_url';
    v_external := v_item->>'launch_id';
    if v_external is null or v_url !~ '^https://trylaunch[.]ai/launch/'
      or v_website !~ '^https?://' then raise exception 'Invalid public Launch record'; end if;
    if coalesce((v_item->>'ambiguous')::boolean,false) then continue; end if;
    if exists (select 1 from app_graph.app_sources
      where source_type='launch' and external_id=v_external) then continue; end if;
    select * into v_source from app_graph.app_sources
      where source_type='launch' and source_url=v_url and status='active'
      limit 1 for update;
    if found then
      if v_source.match_state='attached' and v_source.app_id is not null then
        update app_graph.app_sources set external_id=v_external where id=v_source.id;
      end if;
      continue;
    end if;
    select (pg_catalog.array_agg(id))[1], count(*) into v_app_id, v_count
      from app_graph.apps
      where website_url = pg_catalog.regexp_replace(v_website,'/$','');
    if v_count=1 and not exists (select 1 from app_graph.app_sources
      where source_type='launch' and source_url=v_url) then
      insert into app_graph.app_sources(app_id,source_type,external_id,source_url,
        normalized_source_url,website_url,source_hash,match_state,public_evidence,last_seen_run_id)
        values(v_app_id,'launch',v_external,v_url,v_url,v_website,v_item->>'source_hash',
          'attached',pg_catalog.jsonb_build_object('launch_date',v_item->>'launched_at'),p_run_id);
      insert into app_graph.app_identity_events(app_id,event_type,details)
        values(v_app_id,'launch_source_attached_to_existing',pg_catalog.jsonb_build_object('launch_id',v_external));
    end if;
  end loop;
  return public.sync_launch_app_batch_slice1(p_run_id,p_items);
end;
$$;
revoke all on function public.sync_launch_app_batch(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.sync_launch_app_batch(uuid,jsonb) to service_role;
