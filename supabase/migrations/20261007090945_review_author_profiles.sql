-- Only disclose a published review author's already-public handle. Do not grant
-- anonymous access to member_public_profiles.user_id or private account data.
create schema if not exists review_private;
revoke all on schema review_private from public;
grant usage on schema review_private to anon, authenticated, service_role;

create function review_private.public_author_username(p_review_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select p.username
  from app_graph.app_reviews r
  join app_graph.apps a on a.id = r.app_id
  join public.member_public_profiles p on p.user_id = r.user_id
  where r.id = p_review_id and r.status = 'published' and a.is_public
$$;
revoke all on function review_private.public_author_username(uuid) from public;
grant execute on function review_private.public_author_username(uuid)
  to anon, authenticated, service_role;

create or replace view public.public_app_reviews with (security_invoker = true) as
select r.id, r.app_id, r.user_id, r.rating, r.body, r.created_at, r.updated_at,
  review_private.public_author_username(r.id) as author_username
from app_graph.app_reviews r join app_graph.apps a on a.id = r.app_id
where a.is_public and r.status = 'published';
