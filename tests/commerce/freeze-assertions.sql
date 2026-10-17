do $$
begin
  if not connect_freeze_checkout('11111111-1111-4111-8111-111111111111','app','44444444-4444-4444-8444-444444444444','acct_merchant','freeze-annual','pro-month','EXTERNAL_BUTTON',now()+interval '1 hour') then raise exception 'could not freeze canonical checkout';end if;
  if not exists(select 1 from connect_checkout_attempts where idempotency_key='freeze-annual' and stripe_checkout_session_id is null) then raise exception 'no intent before Stripe';end if;
  begin
    update connect_products set entitlement_key='different-tier' where product_key='pro-year';
    raise exception 'checkout key remained editable';
  exception when raise_exception then if sqlerrm<>'purchased_entitlement_immutable' then raise;end if;end;
  if connect_freeze_checkout('11111111-1111-4111-8111-111111111111','app','44444444-4444-4444-8444-444444444444','acct_merchant','wrong-snapshot','different-tier','EXTERNAL_BUTTON',now()+interval '1 hour') then raise exception 'stale entitlement accepted';end if;
  if connect_freeze_checkout('11111111-1111-4111-8111-111111111111','app','44444444-4444-4444-8444-444444444444','acct_other','wrong-merchant','pro-month','EXTERNAL_BUTTON',now()+interval '1 hour') then raise exception 'wrong merchant accepted';end if;
  if has_function_privilege('authenticated','connect_freeze_checkout(uuid,text,uuid,text,text,text,text,timestamptz)','execute') then raise exception 'public freeze RPC';end if;
end $$;
select 'Atomic offer freeze assertions passed' as result;
