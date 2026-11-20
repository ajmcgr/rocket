-- Preserve exact-phrase ranking while letting multi-word searches find terms
-- separated by other words, and include public category/tag labels.
create or replace function public.search_marketplace(p_query text default '', p_category text default '', p_platform text default '',
  p_pricing text default '', p_billing text default '', p_source text default '', p_sort text default 'discovered',
  p_offset integer default 0, p_limit integer default 24, p_mcp boolean default false) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with input as (select left(lower(btrim(coalesce(p_query, ''))), 80) term),
  q as (select term, array(
    select token.word from pg_catalog.unnest(pg_catalog.regexp_split_to_array(term, '[^[:alnum:]]+')) as token(word)
    where pg_catalog.length(token.word) >= 2
  ) words from input),
  matches as (
    select a.*, case when lower(a.name) = q.term then 100 when left(lower(a.name), length(q.term)) = q.term then 80
      when strpos(lower(a.name), q.term) > 0 then 60
      when pg_catalog.cardinality(q.words) >= 2 and not exists (
        select 1 from pg_catalog.unnest(q.words) as token(word) where strpos(lower(a.name), token.word) = 0
      ) then 50
      when strpos(lower(coalesce(a.tagline, '')), q.term) > 0 then 40 else 20 end relevance
    from public.public_discoverable_apps a cross join q
    cross join lateral (select lower(pg_catalog.concat_ws(' ', a.name, a.tagline, a.description,
      pg_catalog.array_to_string(a.categories, ' '), pg_catalog.array_to_string(a.tags, ' '))) as text) search_text
    left join public.public_marketplace_details d on d.app_id = a.id
    where (q.term = '' or strpos(search_text.text, q.term) > 0 or
      (pg_catalog.cardinality(q.words) >= 2 and not exists (
        select 1 from pg_catalog.unnest(q.words) as token(word)
        where strpos(search_text.text, token.word) = 0
      )))
      and (coalesce(p_category, '') = '' or p_category = any(a.categories))
      and (coalesce(p_platform, '') = '' or p_platform = any(a.platforms))
      and (coalesce(p_source, '') = '' or (p_source = 'launch' and a.launch_url is not null))
      and (coalesce(p_pricing, '') = '' or coalesce(d.pricing_kind, 'unknown') = p_pricing)
      and (coalesce(p_billing, '') = '' or d.billing_model = p_billing or (d.billing_model = 'both' and p_billing in ('one_time', 'subscription')))
      and (not coalesce(p_mcp, false) or exists (
        select 1 from public.app_agent_integrations ai where ai.app_id = a.id and ai.mcp_url is not null
      ))
  ), page as (select m.* from matches m cross join q
    order by case when q.term <> '' then m.relevance else 0 end desc,
      case when p_sort = 'launched' then m.launched_at else m.discovered_at end desc nulls last, m.id
    limit least(greatest(coalesce(p_limit, 24), 1), 48) offset greatest(coalesce(p_offset, 0), 0))
  select pg_catalog.jsonb_build_object('apps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) - 'relevance') from page), '[]'::jsonb),
    'total', (select count(*) from matches));
$$;
