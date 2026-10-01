-- Production security-advisor review: preserve the intentionally public,
-- owner-executed auction read view, but remove its accidental write grants.
-- The underlying bid table has RLS with no public policy; switching this view
-- to security_invoker would silently remove the public bid board.
revoke all on public.ymh_bids_public from public, anon, authenticated;
grant select on public.ymh_bids_public to anon, authenticated;

-- Trigger functions are not public RPCs. Maintenance and auction mutation
-- entrypoints run only from trusted triggers/functions/service callers.
revoke execute on function public.bump_like_count() from public, anon, authenticated;
revoke execute on function public.create_personal_workspace() from public, anon, authenticated;
revoke execute on function public.create_referral_code() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.purge_old_trash() from public, anon, authenticated;
revoke execute on function public.ymh_recalc_current_bid(uuid) from public, anon, authenticated;
revoke execute on function public.ymh_rollover_auctions() from public, anon, authenticated;

-- Authenticated-only operations already perform their own ownership checks;
-- anonymous clients have no legitimate reason to invoke them.
revoke execute on function public.accept_workspace_invite(text) from public, anon;
revoke execute on function public.create_workspace(text) from public, anon;
revoke execute on function public.set_asset_share_password(uuid, text) from public, anon;

-- A public signup must not undo a user's email opt-out without proving that
-- the requester controls that inbox. Keep the function callable for genuinely
-- new addresses; suppress opted-out addresses without disclosing which they are.
create or replace function public.ymh_subscribe_email(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email));
begin
  if v_email is null
     or length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  if not exists (select 1 from public.ymh_email_optouts where email = v_email) then
    insert into public.ymh_email_subscribers (email, source)
    values (v_email, 'alerts_page')
    on conflict (email) do nothing;
  end if;
  return true;
end;
$$;
