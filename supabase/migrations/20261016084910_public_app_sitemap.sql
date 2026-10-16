-- Narrow, read-only projection for sitemap URLs and meaningful app content updates.
create view public.public_app_sitemap with (security_invoker = true) as
select a.slug, a.updated_at
from app_graph.apps a
join public.public_discoverable_apps eligible on eligible.id = a.id
where a.slug is not null;

revoke all on public.public_app_sitemap from public;
grant select on public.public_app_sitemap to anon, authenticated;
