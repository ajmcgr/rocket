-- Signup was failing with "Database error saving new user": any exception inside
-- the on_auth_user_created trigger aborts the auth.users insert. Make each side
-- effect independently fault-tolerant so signup can never be blocked by them.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_is_oauth boolean := v_provider <> 'email';
begin
  begin
    insert into public.profiles (user_id, email, full_name, avatar_url, email_verified, email_verified_at)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'username'),
      new.raw_user_meta_data->>'avatar_url',
      v_is_oauth,
      case when v_is_oauth then now() else null end
    )
    on conflict (user_id) do update
      set email_verified = excluded.email_verified or public.profiles.email_verified,
          email_verified_at = coalesce(public.profiles.email_verified_at, excluded.email_verified_at);
  exception when others then
    raise warning 'handle_new_user: profiles insert failed for %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.user_usage (user_id, plan, monthly_limit)
    values (new.id, 'free', 500)
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user: user_usage insert failed for %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.subscriptions (user_id, plan, status)
    values (new.id, 'free', 'active')
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user: subscriptions insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up while the trigger was broken.
insert into public.profiles (user_id, email, email_verified, email_verified_at)
select u.id, u.email,
       coalesce(u.raw_app_meta_data->>'provider','email') <> 'email',
       case when coalesce(u.raw_app_meta_data->>'provider','email') <> 'email' then now() end
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
on conflict (user_id) do nothing;

insert into public.user_usage (user_id, plan, monthly_limit)
select u.id, 'free', 500 from auth.users u
left join public.user_usage x on x.user_id = u.id
where x.user_id is null
on conflict (user_id) do nothing;

insert into public.subscriptions (user_id, plan, status)
select u.id, 'free', 'active' from auth.users u
left join public.subscriptions s on s.user_id = u.id
where s.user_id is null
on conflict (user_id) do nothing;
