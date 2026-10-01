-- Existing Connect proof clients stay in their historical test environment.
-- A production Rocket ID client must be tied to a claimed Rocket app.
alter table public.rocket_oauth_clients
  add column environment text not null default 'test'
    check (environment in ('test', 'production')),
  add column app_id uuid references app_graph.apps(id) on delete set null;

alter table public.rocket_oauth_clients
  add constraint production_rocket_client_requires_app_owner
  check (environment <> 'production' or (app_id is not null and created_by is not null));

create unique index rocket_oauth_production_app_idx
  on public.rocket_oauth_clients(app_id)
  where environment = 'production';

create index rocket_oauth_client_app_idx
  on public.rocket_oauth_clients(app_id)
  where app_id is not null;
