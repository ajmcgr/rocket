-- Only explicitly published member fields. Never email or auth metadata.
create table public.member_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{2,30}$'),
  full_name text not null default '' check (length(full_name)<=100),
  bio text not null default '' check (length(bio)<=1000),
  avatar_url text not null default '' check (avatar_url='' or avatar_url ~ '^https://'),
  banner_url text not null default '' check (banner_url='' or banner_url ~ '^https://'),
  website text not null default '' check (website='' or website ~ '^https?://'),
  x_username text not null default '' check (x_username ~ '^[a-zA-Z0-9_.-]{0,100}$'),
  instagram_username text not null default '' check (instagram_username ~ '^[a-zA-Z0-9_.-]{0,100}$'),
  linkedin_username text not null default '' check (linkedin_username ~ '^[a-zA-Z0-9_.-]{0,100}$'),
  youtube_channel text not null default '' check (youtube_channel ~ '^[a-zA-Z0-9_.-]{0,100}$'),
  telegram_username text not null default '' check (telegram_username ~ '^[a-zA-Z0-9_.-]{0,100}$')
);
alter table public.member_public_profiles enable row level security;
revoke all on public.member_public_profiles from public,anon,authenticated;
grant select(username,full_name,bio,avatar_url,banner_url,website,x_username,instagram_username,linkedin_username,youtube_channel,telegram_username) on public.member_public_profiles to anon;
grant select,insert,update on public.member_public_profiles to authenticated;
grant all on public.member_public_profiles to service_role;
create policy "Published profile fields" on public.member_public_profiles for select to anon,authenticated using (true);
create policy "Create own public profile" on public.member_public_profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Edit own public profile" on public.member_public_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
