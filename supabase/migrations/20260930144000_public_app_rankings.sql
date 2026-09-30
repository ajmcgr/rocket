-- Rankings use observed public Launch votes, not Rocket sales, traffic or
-- editorial endorsement. Only discoverable apps with a numeric vote snapshot
-- qualify. The client shows exactly the first 20 rows in deterministic order.
create view public.public_app_rankings with (security_invoker = true) as
with launch_evidence as (
  select distinct on (s.app_id) s.app_id, s.public_evidence
  from app_graph.app_sources s
  where s.source_type = 'launch' and s.status = 'active'
    and s.match_state = 'attached'
    and s.public_evidence->>'net_votes' ~ '^[0-9]{1,9}$'
  order by s.app_id, s.last_seen_at desc, s.id
)
select a.id as app_id, a.categories, a.launched_at,
  (e.public_evidence->>'net_votes')::integer as launch_net_votes,
  e.public_evidence->>'votes_observed_at' as votes_observed_at
from public.public_discoverable_apps a
join launch_evidence e on e.app_id = a.id;

-- Only offer category leaderboards capable of showing a complete top 20.
-- New categories still appear in the ordinary Discover category catalogue
-- as soon as apps are submitted under them.
create view public.public_ranking_categories with (security_invoker = true) as
select category, count(*)::integer as app_count
from public.public_app_rankings r
cross join lateral pg_catalog.unnest(r.categories) category
group by category
having count(*) >= 20;

revoke all on public.public_app_rankings, public.public_ranking_categories
  from public, anon, authenticated;
grant select on public.public_app_rankings, public.public_ranking_categories
  to anon, authenticated;
