-- App website URLs in the graph may retain the root trailing slash, while
-- normalizeSourceUrl removes it. Keep exact canonical matching after treating
-- only that trailing slash as equivalent.
create or replace function public.attach_verified_app_source(
  p_user_id uuid, p_app_id uuid, p_source_type text, p_external_id text,
  p_source_url text, p_normalized_source_url text, p_website_url text,
  p_public_evidence jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_source app_graph.app_sources%rowtype; v_app app_graph.apps%rowtype;
begin
  select * into v_app from app_graph.apps where id = p_app_id for update;
  if not found or p_source_type not in ('website','launch','github','hacker_news')
    or pg_catalog.rtrim(v_app.website_url, '/') is distinct from pg_catalog.rtrim(p_website_url, '/')
    then raise exception 'Source does not match the verified app website'; end if;
  if not exists (select 1 from public.app_owners where app_id = p_app_id and user_id = p_user_id
    and verification_level = 'domain_verified' and revoked_at is null) then
    raise exception 'Verified app ownership required'; end if;
  select * into v_source from app_graph.app_sources
    where (source_type = p_source_type and external_id = p_external_id)
      or (normalized_source_url = p_normalized_source_url and status = 'active')
    order by id limit 1 for update;
  if found then
    if v_source.app_id = p_app_id and v_source.match_state = 'attached' then
      return jsonb_build_object('outcome','already_attached');
    end if;
    raise exception 'Source is already attached or needs identity review';
  end if;
  insert into app_graph.app_sources(app_id,source_type,external_id,source_url,
    normalized_source_url,website_url,source_hash,match_state,public_evidence)
    values(p_app_id,p_source_type,p_external_id,p_source_url,p_normalized_source_url,
      p_website_url,pg_catalog.md5(p_source_url),'attached',coalesce(p_public_evidence,'{}'::jsonb))
    returning * into v_source;
  insert into app_graph.app_identity_events(app_id,source_id,event_type,details)
    values(p_app_id,v_source.id,'owner_source_attached',jsonb_build_object('owner_id',p_user_id));
  return jsonb_build_object('outcome','attached','source_id',v_source.id);
end;
$$;
