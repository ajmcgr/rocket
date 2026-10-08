-- Additive: no data writes, payment changes, visibility changes or triggers.
-- Rising continues to read the existing public Rocket view-count aggregate.
-- Only ordinal rankings leave this private helper: scores could reveal purchases
-- by subtraction from the already-public review/bookmark counts.
create function app_graph.rank_marketplace_apps(p_category text default '', p_limit integer default 20)
returns table(app_id uuid, rank_position bigint)
language sql stable security definer set search_path = '' as $$
  with eligible as materialized (
    select a.id, a.name
    from public.public_discoverable_apps a
    where coalesce(btrim(p_category), '') = ''
      or btrim(p_category) = any(a.categories)
  ), purchases as (
    select c.app_id, count(distinct t.user_id)::bigint as purchase_count
    from public.connect_transactions t
    join public.rocket_oauth_clients c on c.client_id = t.client_id
      and c.environment = 'production'
    join eligible a on a.id = c.app_id
    join public.connect_products p on p.id = t.product_id
      and p.client_id = t.client_id
      and p.developer_account_id = t.developer_account_id
    join public.connect_developer_accounts d on d.id = t.developer_account_id
      and d.client_id = t.client_id and d.stripe_account_id = t.stripe_account_id
    where t.amount_cents > 0
      -- Historical settled purchases still count after subscription cancellation.
      -- Failed/pending checkouts, refunds and disputes never contribute.
      and t.status in ('paid', 'canceling', 'past_due')
      and app_graph.marketplace_transaction_paid(t.id)
    group by c.app_id
  ), engagement as (
    select a.id, a.name,
      coalesce(r.rating_count, 0)::bigint as review_count,
      coalesce(s.save_count, 0)::bigint as bookmark_count,
      coalesce(p.purchase_count, 0)::bigint as purchase_count
    from eligible a
    left join public.public_app_review_summary r on r.app_id = a.id
    left join public.app_save_counts s on s.app_id = a.id
    left join purchases p on p.app_id = a.id
  ), ranked as (
    select e.id, row_number() over (
      order by (e.review_count + e.bookmark_count + e.purchase_count) desc,
        e.review_count desc, e.bookmark_count desc, lower(e.name), e.id
    ) as position
    from engagement e
    where e.review_count + e.bookmark_count + e.purchase_count > 0
  )
  select id, position from ranked order by position
  limit greatest(1, least(coalesce(p_limit, 20), 24));
$$;
revoke all on function app_graph.rank_marketplace_apps(text, integer) from public;
grant execute on function app_graph.rank_marketplace_apps(text, integer) to anon, authenticated, service_role;

-- Public invoker entry point. No access to underlying financial tables is granted.
create function public.get_public_app_rankings(p_category text default '', p_limit integer default 20)
returns table(app_id uuid, rank_position bigint)
language sql stable security invoker set search_path = '' as $$
  select app_id, rank_position
  from app_graph.rank_marketplace_apps(p_category, p_limit)
  order by rank_position;
$$;
revoke all on function public.get_public_app_rankings(text, integer) from public;
grant execute on function public.get_public_app_rankings(text, integer) to anon, authenticated, service_role;

comment on function public.get_public_app_rankings(text, integer) is
  'Public app positions: published reviews + current bookmarks + distinct verified production buyers, equal weight. No private purchase/financial totals exposed.';
-- Rollback: restore previous frontend, then DROP the public function followed by
-- app_graph.rank_marketplace_apps(text, integer). Existing views/data stay intact.
