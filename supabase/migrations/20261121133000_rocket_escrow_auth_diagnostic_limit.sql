-- One production authentication probe every five minutes, globally.
-- This table contains timestamps only and is never exposed to clients.
create table deals_private.escrow_auth_diagnostic_limit (
  id boolean primary key default true check (id),
  next_allowed_at timestamptz not null
);
alter table deals_private.escrow_auth_diagnostic_limit enable row level security;
revoke all on deals_private.escrow_auth_diagnostic_limit from public, anon, authenticated;
grant all on deals_private.escrow_auth_diagnostic_limit to service_role;

create function public.rocket_escrow_auth_diagnostic_reserve(p_admin uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_reserved boolean;
begin
  if not exists (
    select 1 from auth.users u where u.id = p_admin
      and lower(u.email) = 'alex@alexmacgregor.com'
      and u.email_confirmed_at is not null and u.deleted_at is null
  ) then
    raise exception 'Admin access denied' using errcode = '42501';
  end if;
  insert into deals_private.escrow_auth_diagnostic_limit(id,next_allowed_at)
    values (true, now() + interval '5 minutes')
    on conflict (id) do update set next_allowed_at = excluded.next_allowed_at
      where deals_private.escrow_auth_diagnostic_limit.next_allowed_at <= now()
    returning true into v_reserved;
  if coalesce(v_reserved,false) then
    insert into public.rocket_admin_audit(admin_user_id,action,target_type,target_id)
      values(p_admin,'escrow_auth_diagnostic','integration','escrow.com');
  end if;
  return coalesce(v_reserved,false);
end $$;
revoke all on function public.rocket_escrow_auth_diagnostic_reserve(uuid) from public, anon, authenticated;
grant execute on function public.rocket_escrow_auth_diagnostic_reserve(uuid) to service_role;
