-- Correct numeric rounding before the first daily refresh.
create or replace function rocket100_private.refresh_scores() returns void
language plpgsql security definer set search_path = '' as $$
begin
  with eligible as materialized (
    select m.user_id,a.app_id from rocket100_private.members m
    cross join lateral rocket100_private.eligible_apps(m.user_id) a
    where m.revoked_at is null
  ), signals as (
    select e.user_id,e.app_id,s.bookmarks,s.reviews,s.purchases,
      3*ln(1+s.bookmarks)+5*ln(1+s.reviews)+8*ln(1+s.purchases) points
    from eligible e cross join lateral rocket100_private.app_signals(e.app_id,e.user_id) s
  ), app_points as (
    select *,row_number() over(partition by user_id order by points desc,app_id) app_position
    from signals
  ), totals as (
    select m.user_id,m.awarded_at,m.founding_number,
      count(p.app_id)::integer app_count,
      coalesce(sum(p.points*case p.app_position when 1 then 1 when 2 then .6 when 3 then .35 when 4 then .2 else .1 end) filter(where p.app_position<=10),0) popularity_points,
      coalesce(sum(p.bookmarks),0)::integer bookmarks,
      coalesce(sum(p.reviews),0)::integer reviews,
      coalesce(sum(p.purchases),0)::integer purchases
    from rocket100_private.members m left join app_points p on p.user_id=m.user_id
    where m.revoked_at is null group by m.user_id,m.awarded_at,m.founding_number
  ), ceilings as (
    select greatest(1,(percentile_cont(.9) within group(order by popularity_points))::numeric) pop_ceiling,
      greatest(ln(2),(percentile_cont(.9) within group(order by ln(1+app_count)))::numeric) portfolio_ceiling
    from totals
  ), normalized as (
    select t.*,round(least(100,100*t.popularity_points/c.pop_ceiling)::numeric,2) pop_score,
      round(least(100,100*ln(1+t.app_count)/c.portfolio_ceiling)::numeric,2) portfolio_score
    from totals t cross join ceilings c
  ), ranked as (
    select *,round(.7*pop_score+.3*portfolio_score)::integer final_score,
      row_number() over(order by round(.7*pop_score+.3*portfolio_score) desc,
        pop_score desc,app_count desc,awarded_at,founding_number,user_id) position
    from normalized
  )
  insert into rocket100_private.scores(user_id,rank_position,score,popularity_score,portfolio_score,popularity_points,eligible_app_count,current_bookmarks,recent_reviews,recent_purchases,calculated_at)
  select user_id,position,final_score,pop_score,portfolio_score,popularity_points,app_count,bookmarks,reviews,purchases,now() from ranked
  on conflict(user_id) do update set rank_position=excluded.rank_position,score=excluded.score,
    popularity_score=excluded.popularity_score,portfolio_score=excluded.portfolio_score,
    popularity_points=excluded.popularity_points,eligible_app_count=excluded.eligible_app_count,
    current_bookmarks=excluded.current_bookmarks,recent_reviews=excluded.recent_reviews,
    recent_purchases=excluded.recent_purchases,calculated_at=excluded.calculated_at;
  insert into rocket100_private.score_history(user_id,score_day,rank_position,score)
    select s.user_id,(now() at time zone 'utc')::date,s.rank_position,s.score from rocket100_private.scores s
    join rocket100_private.members m on m.user_id=s.user_id and m.revoked_at is null
    on conflict(user_id,score_day) do update set rank_position=excluded.rank_position,score=excluded.score;
end $$;
