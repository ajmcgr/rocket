-- Rank the Rocket 100 by live, fresh, exact-visibility verified MRR.
-- Builders without public MRR remain eligible and follow those with it.
-- Preserve the existing score fields for compatibility, and the revenue
-- visibility and comparable-growth checks exactly as before.
create or replace function public.get_rocket100_leaderboard() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'participants', (select count(*) from rocket100_private.members),
    'calculated_at', (select max(calculated_at) from rocket100_private.scores),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', ranked.username, 'name', ranked.full_name, 'avatar_url', ranked.avatar_url,
        'founding_number', ranked.founding_number, 'awarded_at', ranked.awarded_at,
        'rank', ranked.mrr_rank, 'score', ranked.score, 'popularity', ranked.popularity_score,
        'app_count', ranked.eligible_app_count,
        'mrr_minor', ranked.mrr_minor, 'mrr_currency', ranked.currency,
        'mrr_growth_percent', ranked.growth_percent
      ) order by ranked.mrr_rank)
      from (
      select p.username, p.full_name, p.avatar_url, m.founding_number, m.awarded_at,
        s.score, s.popularity_score, s.eligible_app_count,
        revenue.mrr_minor, revenue.currency, revenue.growth_percent,
        row_number() over (order by revenue.mrr_minor desc nulls last, p.username) as mrr_rank
      from rocket100_private.members m
      join public.member_public_profiles p on p.user_id = m.user_id
      left join rocket100_private.scores s on s.user_id = m.user_id
      left join lateral (
        with eligible as (
          select app_id from rocket100_private.eligible_apps(m.user_id)
        ), candidates as (
          select r.app_id, 'stripe'::text as provider,
            upper(r.currency) as currency, r.mrr_minor as current_minor,
            previous.mrr_minor as previous_minor, r.observed_at as observed_at
          from eligible e
          join public.public_app_revenue r on r.app_id = e.app_id
          join public.app_revenue_bindings b on b.app_id = r.app_id
            and b.visibility = 'exact'
          join lateral (
            select q.calculation_version from public.app_revenue_metric_points q
            where q.app_id = r.app_id and q.connection_id = b.connection_id
              and q.mapping_version = b.mapping_version and q.currency = r.currency
              and q.observed_at = r.observed_at and q.mrr_minor = r.mrr_minor
              and q.verification_status = 'verified' and q.source_livemode
            limit 1
          ) current_point on true
          left join lateral (
            select q.mrr_minor from public.app_revenue_metric_points q
            where q.app_id = r.app_id and q.connection_id = b.connection_id
              and q.mapping_version = b.mapping_version
              and q.currency = r.currency and q.metric_type = 'subscription_mrr'
              and q.verification_status = 'verified' and q.source_livemode
              and q.unsupported_subscriptions = 0
              and q.calculation_version = current_point.calculation_version
              and q.observed_at between r.observed_at - interval '37 days'
                                    and r.observed_at - interval '23 days'
            order by abs(extract(epoch from (q.observed_at - (r.observed_at - interval '30 days'))))
            limit 1
          ) previous on true
          where r.visibility = 'exact' and r.metric_type = 'subscription_mrr'
            and r.mrr_minor is not null
            and r.last_verified_at > now() - interval '72 hours'
            and r.observed_at > now() - interval '72 hours'
            and public.app_revenue_is_currently_public(r.app_id, r.currency, r.visibility)
            and exists (select 1 from public.public_apps a where a.id = r.app_id)
          union all
          select r.app_id, r.provider, r.currency, r.value_minor,
            previous.value_minor, r.observed_at
          from eligible e
          join public.public_app_verified_revenue r on r.app_id = e.app_id
          join public.app_verified_revenue_sources source on source.app_id = r.app_id
            and source.provider = r.provider and source.mapping_version = r.mapping_version
            and source.visibility = 'exact'
          join lateral (
            select q.calculation_version from public.app_verified_revenue_points q
            where q.app_id = r.app_id and q.connection_id = source.connection_id
              and q.mapping_version = source.mapping_version and q.provider = source.provider
              and q.external_account_id = source.external_account_id
              and q.external_app_id = source.external_app_id
              and q.product_ids = source.product_ids
              and q.currency = r.currency and q.metric_type = 'subscription_mrr'
              and q.verified_at = r.verified_at and q.value_minor = r.value_minor
              and q.source_environment = 'production'
            limit 1
          ) current_point on true
          left join lateral (
            select q.value_minor from public.app_verified_revenue_points q
            where q.app_id = r.app_id and q.connection_id = source.connection_id
              and q.mapping_version = source.mapping_version
              and q.provider = source.provider
              and q.external_account_id = source.external_account_id
              and q.external_app_id = source.external_app_id
              and q.product_ids = source.product_ids
              and q.currency = r.currency and q.metric_type = 'subscription_mrr'
              and q.source_environment = 'production'
              and q.calculation_version = current_point.calculation_version
              and q.verified_at between r.verified_at - interval '37 days'
                                    and r.verified_at - interval '23 days'
            order by abs(extract(epoch from (q.verified_at - (r.verified_at - interval '30 days'))))
            limit 1
          ) previous on true
          where r.visibility = 'exact' and r.metric_type = 'subscription_mrr'
            and r.value_minor is not null
            and r.verified_at > now() - interval '72 hours'
            and public.app_verified_revenue_is_currently_public(
              r.app_id, r.provider, r.visibility, r.mapping_version)
        ), single_source as (
          -- A provider switch can briefly expose two projections. Hide that
          -- app until only one provider remains, as the app page does.
          select c.* from candidates c
          where not exists (
            select 1 from candidates other
            where other.app_id = c.app_id and other.provider <> c.provider
          )
        ), one_currency_per_app as (
          select distinct on (app_id) app_id, currency, current_minor, previous_minor
          from single_source
          order by app_id, (currency = 'USD') desc, observed_at desc
        )
        select case when count(distinct currency) = 1 then sum(current_minor) end as mrr_minor,
          case when count(distinct currency) = 1 then min(currency) end as currency,
          case when count(distinct currency) = 1
              and count(*) = count(previous_minor)
              and min(previous_minor) > 0
              and sum(previous_minor) > 0
            then round((sum(current_minor) / sum(previous_minor) - 1) * 100, 1)
          end as growth_percent
        from one_currency_per_app
      ) revenue on true
      where m.revoked_at is null
      ) ranked
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_rocket100_leaderboard() from public;
grant execute on function public.get_rocket100_leaderboard() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
