import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { acceptancePlan, pilotBuyer, paidProProof, launchFulfilmentProof, LAUNCH_CLIENT_ID } from '../supabase/functions/_shared/launchAcceptance.ts';
const id = '10000000-0000-4000-8000-000000000001';
const buyer = '20000000-0000-4000-8000-000000000001';
const owner = '20000000-0000-4000-8000-000000000002';
const plan = { id, client_id: LAUNCH_CLIENT_ID, developer_account_id: 'merchant', developer_user_id: owner, amount_cents: 3900, currency: 'usd', billing_type: 'one_time', interval: null, platform_fee_bps: 500, checkout_return_uris: ['https://trylaunch.ai/my-products?success=true'] };
test('private Pro contract rejects monthly, wrong client, merchant, owner, return, amount and fee', () => {
  assert.equal(acceptancePlan(plan,id,'merchant',owner), true);
  for (const delta of [{ amount_cents: 100 }, { billing_type: 'subscription' }, { interval: 'month' }, { platform_fee_bps: 0 }, { currency: 'eur' }, { client_id: 'wrong' }, { developer_account_id: 'other' }, { developer_user_id: buyer }, { checkout_return_uris: [] }]) assert.equal(acceptancePlan({...plan,...delta},id,'merchant',owner), false);
  assert.equal(pilotBuyer(buyer,owner,buyer), true);
  assert.equal(pilotBuyer(owner,owner,owner), false);
});
test('proof requires natural one-time payment and matching unrefunded webhook grant', () => {
  const t = { id, user_id: buyer, client_id: LAUNCH_CLIENT_ID, product_id: id, developer_account_id: 'merchant', stripe_account_id: 'acct_fixture', status: 'paid', amount_cents: 3900, application_fee_cents: 195, currency: 'usd', stripe_subscription_id: null, stripe_checkout_session_id: 'cs_live_fixture', stripe_payment_intent_id: 'pi_fixture' };
  const g = { purchase_id: id, user_id: buyer, client_id: LAUNCH_CLIENT_ID, product_id: id, quantity: 1, status: 'granted' };
  assert.equal(paidProProof(t,g,buyer,plan,'acct_fixture'),true);
  for(const delta of [{status:'refunded'},{quantity:2},{purchase_id:'other'},{user_id:owner}]) assert.equal(paidProProof(t,{...g,...delta},buyer,plan,'acct_fixture'),false);
  assert.equal(paidProProof({...t,stripe_subscription_id:'sub_fixture'},g,buyer,plan,'acct_fixture'),false);
});
test('private proof requires one Launch order for the same buyer, client and product', () => {
  const order = { purchase_id: id, order_id: 'order', launch_product_id: 'draft', rocket_subject: buyer, rocket_client_id: LAUNCH_CLIENT_ID, rocket_product_id: id };
  const state = { identity_verified: true, rocket_subject: buyer, fulfilments: [order] };
  assert.equal(launchFulfilmentProof(state, buyer, id, id), true);
  assert.equal(launchFulfilmentProof({ ...state, rocket_subject: owner }, buyer, id, id), false);
  assert.equal(launchFulfilmentProof({ ...state, fulfilments: [order, order] }, buyer, id, id), false);
  for (const change of [{ rocket_subject: owner }, { rocket_client_id: 'other' }, { rocket_product_id: owner }, { purchase_id: owner }]) {
    assert.equal(launchFulfilmentProof({ ...state, fulfilments: [{ ...order, ...change }] }, buyer, id, id), false);
  }
});
test('old monthly enable flag never enables private checkout or invokes Stripe', async () => {
  const source=(await readFile(new URL('../supabase/functions/launch-rocket-acceptance/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  let handler; const unexpected=()=>{throw new Error('must not call');};
  new Function('Stripe','getAdmin','getConnectToken','getRocketUser','buyMerchantReadiness','liveWebhookConfigured','LAUNCH_APP_ID','LAUNCH_CLIENT_ID','acceptancePlan','pilotBuyer','paidProProof','launchFulfilmentProof','Deno',js)(unexpected,unexpected,unexpected,unexpected,unexpected,unexpected,'app',LAUNCH_CLIENT_ID,acceptancePlan,pilotBuyer,paidProProof,launchFulfilmentProof,{env:{get:k=>k==='LAUNCH_ACCEPTANCE_ENABLED'?'true':undefined},serve:fn=>{handler=fn;}});
  for(const action of ['status','checkout','proof']) {
    const response=await handler(new Request('https://rocket.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}));
    assert.equal(response.status,action==='status'?200:409);
    assert.equal((await response.json()).available,false);
  }
});
