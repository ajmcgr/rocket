-- Rocket's signup, verification and welcome flows promise 500 free credits.
-- Keep the webhook downgrade path and existing free accounts on that same
-- entitlement. This does not affect paid plans or purchased credit packs.
update public.user_usage
set monthly_limit = 500
where plan = 'free'
  and monthly_limit <> 500;
