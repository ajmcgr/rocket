-- Run on a disposable local PostgreSQL database, after bootstrap and migration.
do $$
declare a jsonb; b jsonb;
begin
  if (select entitlement_key from connect_products limit 1)<>'pro-month' then raise exception 'legacy key changed';end if;
  if has_table_privilege('anon','connect_subscription_checkouts','select') or has_function_privilege('authenticated','connect_reserve_subscription(uuid,text,uuid,text,text)','execute') then raise exception 'public reservation access';end if;
  begin
    insert into connect_products select '44444444-4444-4444-8444-444444444444',client_id,developer_account_id,developer_user_id,'pro-year',name,'price_year',stripe_product_id,19000,currency,'year',billing_type,platform_fee_bps,true,now(),description,'pro-month' from connect_products limit 1;
    raise exception 'flag did not protect legacy';
  exception when raise_exception then
    if sqlerrm<>'multi_plan_not_enabled' then raise;end if;
  end;
  update rocket_buy_configuration set multi_plan_enabled=true;
  insert into connect_products select '44444444-4444-4444-8444-444444444444',client_id,developer_account_id,developer_user_id,'pro-year',name,'price_year',stripe_product_id,19000,currency,'year',billing_type,platform_fee_bps,true,now(),description,'pro-month' from connect_products limit 1;
  if (select count(*) from connect_products where is_active)<>2 then raise exception 'multi offers missing';end if;
  begin
    update connect_products set stripe_price_id='price_tampered' where product_key='pro-year';
    raise exception 'identity was mutable';
  exception when raise_exception then if sqlerrm<>'offer_payment_identity_immutable' then raise;end if;end;
  begin
    update connect_products set interval='month' where product_key='pro-year';
    raise exception 'interval was mutable';
  exception when raise_exception then if sqlerrm<>'offer_payment_identity_immutable' then raise;end if;end;
  a:=connect_reserve_subscription('11111111-1111-4111-8111-111111111111','app','33333333-3333-4333-8333-333333333333','acct_merchant','ROCKET_MARKETPLACE');
  b:=connect_reserve_subscription('11111111-1111-4111-8111-111111111111','app','44444444-4444-4444-8444-444444444444','acct_merchant','EXTERNAL_BUTTON');
  if a->>'idempotency_key'<>b->>'idempotency_key' or b->>'product_id'<>'33333333-3333-4333-8333-333333333333' then raise exception 'different plans won reservation';end if;
  begin
    perform connect_reserve_subscription('11111111-1111-4111-8111-111111111111','app','33333333-3333-4333-8333-333333333333','acct_other','ROCKET_MARKETPLACE');
    raise exception 'cross merchant reservation';
  exception when raise_exception then if sqlerrm<>'offer_not_published' then raise;end if;end;
  insert into connect_checkout_attempts values('33333333-3333-4333-8333-333333333333');
  begin
    update connect_products set entitlement_key='new-access' where product_key='pro-month';
    raise exception 'sold key was mutable';
  exception when raise_exception then if sqlerrm<>'purchased_entitlement_immutable' then raise;end if;end;
  update connect_products set is_active=false where product_key='pro-year';
  if (select count(*) from connect_products)<>2 then raise exception 'unpublish deleted history';end if;
end $$;
select 'SQL assertions passed' as result;
