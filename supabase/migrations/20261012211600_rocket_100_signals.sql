-- Server-only eligible organic engagement. Self-actions and unconfirmed
-- bookmark/review accounts cannot directly boost a Rocket 100 score.
create function rocket100_private.app_signals(p_app_id uuid,p_owner_id uuid)
returns table(bookmarks integer,reviews integer,purchases integer)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::integer from public.saved_apps sa join auth.users u on u.id=sa.user_id
      where sa.app_id=p_app_id and sa.user_id<>p_owner_id
        and u.email_confirmed_at is not null and u.deleted_at is null),
    (select count(*)::integer from app_graph.app_reviews r join auth.users u on u.id=r.user_id
      where r.app_id=p_app_id and r.user_id<>p_owner_id and r.status='published'
        and r.created_at>=now()-interval '30 days'
        and u.email_confirmed_at is not null and u.deleted_at is null),
    (select count(distinct t.user_id)::integer from public.connect_transactions t
      join public.rocket_oauth_clients c on c.client_id=t.client_id
        and c.environment='production' and c.app_id=p_app_id
      join public.connect_products p on p.id=t.product_id and p.client_id=t.client_id
        and p.developer_account_id=t.developer_account_id
      join public.connect_developer_accounts d on d.id=t.developer_account_id
        and d.client_id=t.client_id and d.stripe_account_id=t.stripe_account_id
      where t.user_id<>p_owner_id and t.amount_cents>0
        and t.status in ('paid','canceling','past_due')
        and t.created_at>=now()-interval '30 days'
        and app_graph.marketplace_transaction_paid(t.id));
$$;
revoke all on function rocket100_private.app_signals(uuid,uuid) from public,anon,authenticated;
