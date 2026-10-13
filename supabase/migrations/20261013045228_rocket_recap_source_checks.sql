-- Revocation and sharing fail closed when an app source is withdrawn.
create or replace function public.create_rocket_recap_share(p_month date, p_app_id uuid, p_metrics text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_recap public.rocket_recaps%rowtype;
  v_app jsonb; v_metrics jsonb := '{}'::jsonb; v_key text; v_id uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_recap from public.rocket_recaps
    where user_id = v_user and month_start = p_month;
  if not found then raise exception 'recap unavailable'; end if;
  if p_app_id is not null then
    select value into v_app from jsonb_array_elements(v_recap.apps)
      where value->>'id' = p_app_id::text limit 1;
    if v_app is null then raise exception 'app unavailable'; end if;
  end if;
  if not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
    where o.user_id=v_user and o.revoked_at is null and o.verification_level='domain_verified'
      and a.is_public and (p_app_id is null or a.id=p_app_id)
      and exists (select 1 from app_graph.app_sources source where source.app_id=a.id and source.status='active')) then
    raise exception 'ownership unavailable';
  end if;
  if not exists (select 1 from public.member_public_profiles p where p.user_id=v_user) then
    raise exception 'publish a public profile before sharing';
  end if;
  if exists (select 1 from jsonb_array_elements(v_recap.apps) item
    where (p_app_id is null or item->>'id'=p_app_id::text)
      and not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
        where o.app_id=(item->>'id')::uuid and o.user_id=v_user and o.revoked_at is null
          and o.verification_level='domain_verified' and a.is_public
          and exists (select 1 from app_graph.app_sources source where source.app_id=a.id and source.status='active'))) then
    raise exception 'an app is no longer eligible';
  end if;
  if p_metrics is null or cardinality(p_metrics) = 0 or cardinality(p_metrics) > 2 then
    raise exception 'select one or two metrics';
  end if;
  foreach v_key in array p_metrics loop
    if v_key not in ('views','clicks') or v_metrics ? v_key then raise exception 'invalid metric'; end if;
    if (case when p_app_id is null then v_recap.totals else v_app end ->> v_key)::bigint <= 0 then
      raise exception 'metric unavailable';
    end if;
    v_metrics := v_metrics || jsonb_build_object(v_key,
      (case when p_app_id is null then v_recap.totals else v_app end ->> v_key)::bigint);
  end loop;
  insert into public.rocket_recap_shares(user_id,month_start,app_id,snapshot)
    values (v_user,p_month,p_app_id,jsonb_build_object(
      'month',p_month,'app',case when p_app_id is null then null else
        jsonb_build_object('id',p_app_id,'slug',v_app->>'slug','name',v_app->>'name','logo_url',v_app->>'logo_url') end,
      'metrics',v_metrics,'coverage',v_recap.coverage,
      'app_ids',case when p_app_id is null then
        (select coalesce(jsonb_agg(item->>'id'),'[]'::jsonb) from jsonb_array_elements(v_recap.apps) item)
        else jsonb_build_array(p_app_id::text) end)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_public_rocket_recap(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',s.id,'snapshot',s.snapshot,'username',p.username,
    'avatar_url',p.avatar_url,'profile_url','/@' || p.username)
  from public.rocket_recap_shares s
  join public.member_public_profiles p on p.user_id=s.user_id
  where s.id=p_id and s.revoked_at is null
    and not exists (select 1 from jsonb_array_elements_text(s.snapshot->'app_ids') app_id
      where not exists (select 1 from public.app_owners o join app_graph.apps a on a.id=o.app_id
        where o.app_id=app_id::uuid and o.user_id=s.user_id and o.revoked_at is null
          and o.verification_level='domain_verified' and a.is_public
          and exists (select 1 from app_graph.app_sources source where source.app_id=a.id and source.status='active')));
$$;
