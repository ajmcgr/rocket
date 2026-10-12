-- Bring the source migrations in line with the provider-aware tables already
-- present in production. This precedes authoritative provider selection.
alter table public.app_data_connections add column if not exists posthog_region text;
alter table public.app_data_oauth_states add column if not exists provider text not null default 'ga4';
alter table public.app_data_oauth_states add column if not exists posthog_region text;
alter table public.app_metric_visibility add column if not exists provider text not null default 'ga4';

alter table public.app_data_connections drop constraint if exists app_data_connections_provider_check;
alter table public.app_data_connections add constraint app_data_connections_provider_check
  check (provider in ('ga4', 'posthog'));
alter table public.app_data_connections drop constraint if exists app_data_connections_posthog_region_check;
alter table public.app_data_connections add constraint app_data_connections_posthog_region_check
  check (posthog_region in ('us', 'eu'));
alter table public.app_data_oauth_states drop constraint if exists app_data_oauth_states_provider_check;
alter table public.app_data_oauth_states add constraint app_data_oauth_states_provider_check
  check (provider in ('ga4', 'posthog'));
alter table public.app_data_oauth_states drop constraint if exists app_data_oauth_states_posthog_region_check;
alter table public.app_data_oauth_states add constraint app_data_oauth_states_posthog_region_check
  check (posthog_region in ('us', 'eu'));
alter table public.app_metric_points drop constraint if exists app_metric_points_provider_check;
alter table public.app_metric_points add constraint app_metric_points_provider_check
  check (provider in ('ga4', 'posthog'));
alter table public.app_metric_visibility drop constraint if exists app_metric_visibility_provider_check;
alter table public.app_metric_visibility add constraint app_metric_visibility_provider_check
  check (provider in ('ga4', 'posthog'));
alter table public.public_app_traction drop constraint if exists public_app_traction_provider_check;
alter table public.public_app_traction add constraint public_app_traction_provider_check
  check (provider in ('ga4', 'posthog'));

do $$
begin
  if exists (select 1 from pg_constraint where conrelid='public.app_metric_visibility'::regclass
      and conname='app_metric_visibility_pkey'
      and pg_get_constraintdef(oid)='PRIMARY KEY (app_id, metric_type)') then
    alter table public.app_metric_visibility drop constraint app_metric_visibility_pkey;
    alter table public.app_metric_visibility add primary key (app_id, provider, metric_type);
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.public_app_traction'::regclass
      and conname='public_app_traction_pkey'
      and pg_get_constraintdef(oid)='PRIMARY KEY (app_id, metric_type)') then
    alter table public.public_app_traction drop constraint public_app_traction_pkey;
    alter table public.public_app_traction add primary key (app_id, provider, metric_type);
  end if;
end;
$$;
