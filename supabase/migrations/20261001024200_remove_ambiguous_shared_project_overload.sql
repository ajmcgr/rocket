-- The existing get_shared_project(uuid, text default null) already checks the
-- project password. Remove only the one-argument overload introduced by the
-- immediately preceding hardening migration; it makes RPC resolution ambiguous.
drop function public.get_shared_project(uuid);
