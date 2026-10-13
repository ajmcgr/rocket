-- Developer-declared, public agent connection links. No credentials or endpoint fetches.
create table public.app_agent_integrations (
  app_id uuid primary key references app_graph.apps(id) on delete cascade,
  mcp_url text check (mcp_url is null or (length(mcp_url) <= 2048 and mcp_url ~ '^https://[^[:space:]]+$')),
  api_docs_url text check (api_docs_url is null or (length(api_docs_url) <= 2048 and api_docs_url ~ '^https://[^[:space:]]+$')),
  github_url text check (github_url is null or (length(github_url) <= 2048 and github_url ~ '^https://github[.]com/[^[:space:]]+$')),
  deployment_url text check (deployment_url is null or (length(deployment_url) <= 2048 and deployment_url ~ '^https://[^[:space:]]+$')),
  supported_clients text[] not null default '{}'
    check (cardinality(supported_clients) <= 5 and supported_clients <@ array['Claude','ChatGPT','Cursor','Windsurf','VS Code']::text[]),
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.app_agent_integrations enable row level security;

-- The function checks live ownership, revocation and public app state without
-- exposing app_owners to anonymous Data API clients.
create function public.agent_integrations_current(p_app_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_owners o
    join app_graph.apps a on a.id = o.app_id
    where o.app_id = p_app_id and o.user_id = p_user_id
      and o.revoked_at is null and o.verification_level = 'domain_verified'
      and a.is_public
  );
$$;
revoke all on function public.agent_integrations_current(uuid,uuid) from public;
grant execute on function public.agent_integrations_current(uuid,uuid) to anon, authenticated, service_role;

create policy "Current verified owner agent links" on public.app_agent_integrations
  for select to anon, authenticated
  using (public.agent_integrations_current(app_id, updated_by));
revoke all on public.app_agent_integrations from public, anon, authenticated;
grant select (app_id, mcp_url, api_docs_url, github_url, deployment_url, supported_clients)
  on public.app_agent_integrations to anon, authenticated;
grant all on public.app_agent_integrations to service_role;

-- Keep the existing search relevance and ordering intact; the new predicate
-- narrows the result set before pagination only when requested.
drop function public.search_marketplace(text,text,text,text,text,text,text,integer,integer);
create function public.search_marketplace(p_query text default '',p_category text default '',p_platform text default '',
  p_pricing text default '',p_billing text default '',p_source text default '',p_sort text default 'discovered',
  p_offset integer default 0,p_limit integer default 24,p_mcp boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
  with q as (select left(lower(btrim(coalesce(p_query,''))),80) term), matches as (
    select a.*, case when lower(a.name)=q.term then 100 when left(lower(a.name),length(q.term))=q.term then 80
      when strpos(lower(a.name),q.term)>0 then 60 when strpos(lower(coalesce(a.tagline,'')),q.term)>0 then 40 else 20 end relevance
    from public.public_discoverable_apps a cross join q left join public.public_marketplace_details d on d.app_id=a.id
    where (q.term='' or strpos(lower(a.name||' '||coalesce(a.tagline,'')||' '||coalesce(a.description,'')),q.term)>0)
      and (coalesce(p_category,'')='' or p_category=any(a.categories))
      and (coalesce(p_platform,'')='' or p_platform=any(a.platforms))
      and (coalesce(p_source,'')='' or (p_source='launch' and a.launch_url is not null))
      and (coalesce(p_pricing,'')='' or coalesce(d.pricing_kind,'unknown')=p_pricing)
      and (coalesce(p_billing,'')='' or d.billing_model=p_billing or (d.billing_model='both' and p_billing in ('one_time','subscription')))
      and (not coalesce(p_mcp,false) or exists (
        select 1 from public.app_agent_integrations ai where ai.app_id=a.id and ai.mcp_url is not null
      ))
  ), page as (select m.* from matches m cross join q
    order by case when q.term<>'' then m.relevance else 0 end desc,
      case when p_sort='launched' then m.launched_at else m.discovered_at end desc nulls last,m.id
    limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0))
  select jsonb_build_object('apps',coalesce((select jsonb_agg(to_jsonb(page)-'relevance') from page),'[]'::jsonb),'total',(select count(*) from matches));
$$;
revoke all on function public.search_marketplace(text,text,text,text,text,text,text,integer,integer,boolean) from public;
grant execute on function public.search_marketplace(text,text,text,text,text,text,text,integer,integer,boolean) to anon, authenticated;
