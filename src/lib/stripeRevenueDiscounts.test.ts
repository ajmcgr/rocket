import { describe,it,expect } from 'vitest';
import { calculateSubscriptionMrr,MRR_CALCULATION_VERSION,type RevenueSubscription } from '../../supabase/functions/_shared/stripeRevenueMrr';
const mapping={price_id:'price_fixture',product_id:'prod_fixture',currency:'usd'};
const permanent=(percent=20)=>({id:'di_fixture',object:'discount',start:10,end:null,source:{type:'coupon',coupon:{id:'coupon_fixture',duration:'forever',percent_off:percent,amount_off:null}}});
const subscription:RevenueSubscription={id:'sub_fixture',status:'active',livemode:true,items:[{quantity:1,price:{id:'price_fixture',product:'prod_fixture',currency:'usd',unit_amount_decimal:'1000',billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]};
const result=(sub:RevenueSubscription)=>calculateSubscriptionMrr([sub],[mapping],1000)[0];
describe('permanent percentage subscription discounts',()=>{
 it('subtracts a verified permanent percentage discount and increments calculation version',()=>{
  expect(MRR_CALCULATION_VERSION).toBe(2);
  expect(result({...subscription,discounts:[permanent()]})).toMatchObject({mrr_minor:'800.000000',verification_status:'verified'});
 });
 it('handles a 100% recurring discount as verified zero without dropping the subscription',()=>{
  expect(result({...subscription,discounts:[permanent(100)]})).toMatchObject({mrr_minor:'0.000000',verification_status:'verified',included_subscriptions:1});
 });
 it('normalizes annual quantity and fractional percentages using exact arithmetic',()=>{
  const item=subscription.items[0];
  expect(result({...subscription,items:[{...item,quantity:3,price:{...item.price,unit_amount_decimal:'12000',recurring:{interval:'year',interval_count:1,usage_type:'licensed'}}}],discounts:[permanent(12.5)]}).mrr_minor).toBe('2625.000000');
 });
 it('compounds one permanent percentage at each level without intermediate rounding',()=>{
  expect(result({...subscription,discounts:[permanent(10)],items:[{...subscription.items[0],discounts:[permanent(20)]}]}).mrr_minor).toBe('720.000000');
 });
 it('respects product-limited coupons and supports the legacy expanded coupon shape',()=>{
  const d=permanent();
  expect(result({...subscription,discounts:[{...d,source:{type:'coupon',coupon:{...d.source.coupon,applies_to:{products:['prod_other']}}}}]}).mrr_minor).toBe('1000.000000');
  expect(result({...subscription,discounts:[{...d,source:undefined,coupon:d.source.coupon}]}).mrr_minor).toBe('800.000000');
 });
 it.each([
  ['unresolved','di_fixture'],['fixed',{...permanent(),source:{coupon:{duration:'forever',amount_off:200,percent_off:null}}}],
  ['temporary',{...permanent(),source:{coupon:{duration:'repeating',percent_off:20}}}],
  ['once',{...permanent(),source:{coupon:{duration:'once',percent_off:20}}}],
  ['expired',{...permanent(),end:999}],['future',{...permanent(),start:1001}],
  ['invalid percentage',permanent(101)],['negative percentage',permanent(-1)],['malformed',{}]
 ])('does not fabricate a verified total for %s discounts',(_name,discount)=>{
  expect(result({...subscription,discounts:[discount]})).toMatchObject({verification_status:'unsupported',unsupported_subscriptions:1,unsupported_reasons:{subscription_discount:1}});
 });
 it('keeps multiple discounts at the same level unsupported',()=>{
  expect(result({...subscription,discounts:[permanent(),permanent()]}).verification_status).toBe('unsupported');
 });
});
