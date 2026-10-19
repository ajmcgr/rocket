-- PostgREST validates the supplied credential and establishes the database role.
-- This probe has no access to recipient records and performs no writes.
create or replace function public.rocket_outreach_is_scheduler()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select current_user = 'service_role'; $$;
revoke all on function public.rocket_outreach_is_scheduler() from public, anon, authenticated;
grant execute on function public.rocket_outreach_is_scheduler() to service_role;
