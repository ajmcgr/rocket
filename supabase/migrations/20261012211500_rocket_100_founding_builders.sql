-- Rocket 100 private membership and eligibility. No awards are seeded.
create schema if not exists rocket100_private;

revoke all on schema rocket100_private from public, anon, authenticated;

create table rocket100_private.members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  founding_number smallint not null unique check (founding_number between 1 and 100),
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text
);

create table rocket100_private.scores (
  user_id uuid primary key references rocket100_private.members(user_id) on delete cascade,
  rank_position integer,
  score integer not null default 0 check (score between 0 and 100),
  popularity_score numeric(6,2) not null default 0,
  portfolio_score numeric(6,2) not null default 0,
  popularity_points numeric(14,4) not null default 0,
  eligible_app_count integer not null default 0,
  current_bookmarks integer not null default 0,
  recent_reviews integer not null default 0,
  recent_purchases integer not null default 0,
  calculated_at timestamptz not null default now()
);

create table rocket100_private.score_history (
  user_id uuid not null references rocket100_private.members(user_id) on delete cascade,
  score_day date not null,
  rank_position integer,
  score integer not null,
  primary key (user_id, score_day)
);

alter table rocket100_private.members enable row level security;

alter table rocket100_private.scores enable row level security;

alter table rocket100_private.score_history enable row level security;

revoke all on all tables in schema rocket100_private from public, anon, authenticated;

create function rocket100_private.eligible_apps(p_user_id uuid)
returns table(app_id uuid) language sql stable security definer set search_path = '' as $$
  select a.id from public.app_owners o
  join public.public_discoverable_apps a on a.id=o.app_id
  join app_graph.apps raw on raw.id=a.id
  join public.app_claims c on c.id=o.claim_id
  where o.user_id=p_user_id and o.revoked_at is null
    and o.verification_level='domain_verified'
    and c.status='verified' and c.verification_state='domain_verified'
    and raw.seed_source_type <> 'test'
  order by a.id;
$$;

revoke all on function rocket100_private.eligible_apps(uuid) from public,anon,authenticated;

create function rocket100_private.qualified(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id=p_user_id
    and u.email_confirmed_at is not null and u.deleted_at is null)
    and exists(select 1 from public.member_public_profiles p where p.user_id=p_user_id
      and length(btrim(p.full_name))>=2 and length(btrim(p.bio))>=10
      and length(btrim(p.avatar_url))>0)
    and exists(select 1 from rocket100_private.eligible_apps(p_user_id));
$$;

revoke all on function rocket100_private.qualified(uuid) from public,anon,authenticated;
