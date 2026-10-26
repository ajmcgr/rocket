-- Store apps share hosts (and sometimes developer websites). Resolve only by
-- store identity; the ordinary website resolver and ownership gates stay intact.
create function app_graph.store_listing_identity(p_url text)
returns text language sql immutable strict set search_path = '' as $$
  select case
    when p_url ~ '^https?://apps[.]apple[.]com/([a-z]{2}/)?app/([^/?#]+/)?id[1-9][0-9]*([/?#].*)?$'
      then 'apple_app_store:' || substring(p_url from '/id([1-9][0-9]*)(?:[/?#]|$)')
    when p_url ~ '^https?://play[.]google[.]com/store/apps/details[?]'
      then 'google_play:' || substring(p_url from '[?&]id=([A-Za-z][A-Za-z0-9_]*(?:[.][A-Za-z][A-Za-z0-9_]*)+)(?:[&#]|$)')
    else null end;
$$;
revoke all on function app_graph.store_listing_identity(text) from public, anon, authenticated;
grant execute on function app_graph.store_listing_identity(text) to service_role;

create function public.lookup_store_app_submission(p_source_type text, p_external_id text)
returns table(id uuid, name text, description text, website_url text, logo_url text, categories text[])
language sql security invoker set search_path = '' as $$
  select a.id, a.name, a.description, a.website_url, a.logo_url, a.categories
  from app_graph.apps a
  where a.is_public and p_source_type in ('apple_app_store','google_play') and (
    app_graph.store_listing_identity(a.website_url) = p_source_type || ':' || p_external_id
    or exists (select 1 from app_graph.app_sources s where s.app_id = a.id
      and s.source_type = p_source_type and s.external_id = p_external_id
      and s.status = 'active' and s.match_state = 'attached'))
  order by a.id limit 3;
$$;
revoke all on function public.lookup_store_app_submission(text,text) from public, anon, authenticated;
grant execute on function public.lookup_store_app_submission(text,text) to service_role;

create function public.resolve_store_app_submission(
  p_user_id uuid, p_job_id uuid, p_source_type text, p_external_id text,
  p_source_url text, p_name text, p_description text, p_logo_url text,
  p_public_evidence jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_app_id uuid; v_source app_graph.app_sources%rowtype; v_candidates uuid[];
  v_count integer; v_result text := 'new'; v_host text;
begin
  if p_user_id is null or p_job_id is null or p_source_type not in ('apple_app_store','google_play')
    or p_external_id is null or p_source_url is null or p_name is null
    or length(p_name) not between 1 and 240
    or app_graph.store_listing_identity(p_source_url) is distinct from p_source_type || ':' || p_external_id
    or p_source_url <> (case when p_source_type = 'apple_app_store'
      then 'https://apps.apple.com/app/id' || p_external_id
      else 'https://play.google.com/store/apps/details?id=' || p_external_id end)
    then raise exception 'Invalid store app submission'; end if;
  perform 1 from public.app_jobs j where j.id=p_job_id and j.user_id=p_user_id
    and j.normalized_url=p_source_url for update;
  if not found then raise exception 'Your store submission job is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source_type || ':' || p_external_id,20261026));
  select * into v_source from app_graph.app_sources s
    where s.source_type=p_source_type and s.external_id=p_external_id for update;
  if found then
    if v_source.match_state <> 'attached' or v_source.status <> 'active' or v_source.app_id is null then
      raise exception 'This store listing needs an identity review'; end if;
    v_app_id := v_source.app_id;
    v_result := 'existing';
  else
    select array_agg(a.id order by a.id), count(*) into v_candidates,v_count
      from app_graph.apps a where app_graph.store_listing_identity(a.website_url)=p_source_type || ':' || p_external_id;
    if v_count > 1 then raise exception 'Multiple apps match this store listing; request an identity review'; end if;
    if v_count = 1 then v_app_id := v_candidates[1]; v_result := 'existing'; end if;
  end if;
  if v_app_id is not null then
    if not exists(select 1 from app_graph.apps a where a.id=v_app_id and a.is_public)
      and not exists(select 1 from public.app_jobs j where j.app_id=v_app_id and j.user_id=p_user_id)
      then raise exception 'This store listing already has a private submission'; end if;
    if exists(select 1 from public.app_jobs j where j.user_id=p_user_id
      and j.app_id=v_app_id and j.status='complete' and j.result->>'outcome'='new')
      and not exists(select 1 from app_graph.apps a where a.id=v_app_id and a.is_public)
      then v_result := 'new'; end if;
  else
    v_host := case when p_source_type='apple_app_store' then 'apps.apple.com' else 'play.google.com' end;
    insert into app_graph.apps(seed_source_type,seed_source_external_id,name,description,website_url,canonical_host,logo_url,source_hash,is_public)
      values(p_source_type,p_external_id,p_name,left(p_description,2000),p_source_url,v_host,p_logo_url,pg_catalog.md5(p_source_url),false)
      returning app_graph.apps.id into v_app_id;
    insert into app_graph.app_sources(app_id,source_type,external_id,source_url,normalized_source_url,website_url,source_hash,match_state,public_evidence)
      values(v_app_id,p_source_type,p_external_id,p_source_url,p_source_url,p_source_url,pg_catalog.md5(p_source_url),'attached',coalesce(p_public_evidence,'{}'::jsonb));
    insert into app_graph.app_identity_events(app_id,event_type,details)
      values(v_app_id,'user_app_created',jsonb_build_object('user_id',p_user_id,'job_id',p_job_id));
  end if;
  update public.app_jobs set status='complete',app_id=v_app_id,error=null,updated_at=now(),
    result=jsonb_build_object('outcome',v_result,'app_id',v_app_id,'name',p_name,'description',p_description,'website_url',p_source_url,'logo_url',p_logo_url)
    where public.app_jobs.id=p_job_id and user_id=p_user_id;
  return jsonb_build_object('outcome',v_result,'app_id',v_app_id);
end;
$$;
revoke all on function public.resolve_store_app_submission(uuid,uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_store_app_submission(uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;
