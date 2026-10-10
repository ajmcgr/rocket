-- A disputed charge immediately loses its advertising placement. This remains
-- separate from refunds because a dispute is not a completed refund.
alter table public.rocket_sponsorships
  drop constraint rocket_sponsorships_stripe_payment_status_check;
alter table public.rocket_sponsorships
  add constraint rocket_sponsorships_stripe_payment_status_check
  check (stripe_payment_status in ('unpaid', 'paid', 'refunded', 'disputed'));

create function public.apply_rocket_sponsorship_dispute(
  p_event_id text, p_payment_intent_id text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.rocket_sponsorships
    where stripe_payment_intent_id=p_payment_intent_id for update;
  if not found then return false; end if;
  insert into public.rocket_sponsorship_webhook_events(event_id,sponsorship_id,event_type)
    values(p_event_id,v_id,'dispute') on conflict do nothing;
  if not found then return false; end if;
  update public.rocket_sponsorships set stripe_payment_status='disputed',
    status='cancelled',moderation_hold=true,
    actual_end_at=least(coalesce(actual_end_at,now()),now())
    where id=v_id;
  return true;
end;
$$;
revoke all on function public.apply_rocket_sponsorship_dispute(text,text)
  from public, anon, authenticated;
grant execute on function public.apply_rocket_sponsorship_dispute(text,text)
  to service_role;
