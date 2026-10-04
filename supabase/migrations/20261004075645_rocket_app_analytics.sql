-- Aggregates only: no visitor fingerprints, saver identities or hidden reviews leave the server.
create function public.get_owned_app_rocket_analytics(p_app_id uuid,p_user_id uuid,p_days integer default 30,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_today date := (now() at time zone 'utc')::date; v_from date; v_result jsonb;
begin
  if p_days is null or p_days not in (7,30,90) or p_page is null or p_page<1 or p_page>10000 then
    raise exception 'Invalid analytics range or page';
  end if;
  if not exists(select 1 from public.app_owners where app_id=p_app_id and user_id=p_user_id and revoked_at is null) then
    raise exception 'Active app ownership required' using errcode='42501';
  end if;
  v_from := v_today-(p_days-1);
  with views as (
    select view_day,count(*) as views from app_graph.app_profile_view_events
      where app_id=p_app_id and view_day between v_from and v_today group by view_day
  ), reviews as (
    select id,rating,body,created_at from app_graph.app_reviews where app_id=p_app_id and status='published'
  ), period_reviews as (
    select * from reviews where created_at>=v_from::timestamp at time zone 'utc'
      and created_at<(v_today+1)::timestamp at time zone 'utc'
  )
  select jsonb_build_object(
    'app_id',p_app_id,'app_name',coalesce((select name from public.public_apps where id=p_app_id),'Your app'),
    'from',v_from,'to',v_today,'days',p_days,'page',p_page,'page_size',10,
    'profile_views',coalesce((select sum(views) from views),0),
    'total_profile_views',coalesce((select rocket_view_count from public.app_profile_view_counts where app_id=p_app_id),0),
    'review_count',(select count(*) from reviews),
    'period_review_count',(select count(*) from period_reviews),
    'average_rating',(select round(avg(rating)::numeric,1) from reviews),
    'save_count',coalesce((select save_count from public.app_save_counts where app_id=p_app_id),0),
    'daily_views',(select jsonb_agg(jsonb_build_object('day',v_from+i,'views',coalesce(v.views,0)) order by i)
      from generate_series(0,p_days-1) i left join views v on v.view_day=v_from+i),
    'rating_distribution',(select jsonb_agg(jsonb_build_object('stars',s,'count',(select count(*) from reviews where rating=s)) order by s desc) from generate_series(1,5) s),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from
      (select * from period_reviews order by created_at desc,id desc limit 10 offset ((p_page-1)*10)) r),'[]'::jsonb),
    'updated_at',now()
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_owned_app_rocket_analytics(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_owned_app_rocket_analytics(uuid,uuid,integer,integer) to service_role;
