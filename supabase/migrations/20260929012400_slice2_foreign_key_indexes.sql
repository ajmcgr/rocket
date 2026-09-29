-- Keep ownership and challenge lookups bounded as Slice 2 usage grows.
create index if not exists app_jobs_app_idx on public.app_jobs (app_id);
create index if not exists app_challenges_app_idx on public.app_verification_challenges (app_id);
create index if not exists app_challenges_user_idx on public.app_verification_challenges (user_id);
