// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe,it,expect,vi } from 'vitest';
import * as oauth from '../../supabase/functions/_shared/stripeRevenueOAuth';
import * as mrr from '../../supabase/functions/_shared/stripeRevenueMrr';
const user='10000000-0000-4000-8000-000000000001',app='20000000-0000-4000-8000-000000000001';
const compiled=ts.transpileModule(readFileSync('supabase/functions/rocket-stripe-revenue/index.ts','utf8').replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const price=(id:string,amount:string,interval='month')=>({id,product:'prod_fixture',currency:'usd',unit_amount_decimal:amount,billing_scheme:'per_unit',recurring:{interval,interval_count:1,usage_type:'licensed'}});
async function fixture({products=false,conflict=false,revoked=false,discount=false,resolvedDiscount=false}={}){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('a'.repeat(32)),'AES-GCM',false,['encrypt']);
 const iv=new Uint8Array(12);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('fixture-token')));
 const b64=(b:Uint8Array)=>Buffer.from(b).toString('base64url');
 const env:Record<string,string>={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',STRIPE_REVENUE_LIVE_ENABLED:'true',STRIPE_REVENUE_PILOT_APP_IDS:app,STRIPE_REVENUE_PUBLIC_CLIENT_ID:'ca_fixture',STRIPE_REVENUE_APP_LIVE_API_KEY:'sk_live_fixture',STRIPE_REVENUE_TOKEN_ENCRYPTION_KEY:b64(new TextEncoder().encode('a'.repeat(32)))};
 const binding={connection_id:'connection',owner_user_id:user,mapping_version:1,revenue_scope:'products',visibility:'range'};
 const connection={id:'connection',owner_user_id:user,provider:'stripe',status:'active',livemode:true,external_account_id:'acct_fixture',access_token_expires_at:new Date(Date.now()+3600000).toISOString(),access_token_ciphertext:b64(cipher),access_token_iv:b64(iv)};
 const points:unknown[]=[];
 const mappings=products?[{stripe_price_id:'price_first',stripe_product_id:'prod_fixture',currency:'usd'}]:[];
 const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
  if(name==='configure_app_stripe_revenue'){
   if(conflict)return {data:null,error:{code:'23505'}};
   expect(args.p_expected_version).toBe(binding.mapping_version);
   binding.revenue_scope='account';binding.mapping_version++;binding.visibility='private';
   return {data:binding.mapping_version,error:null};
  }
  return {data:null,error:null};
 });
 function from(table:string){let inserted=false;const result=()=>({error:null,data:inserted?null:table==='app_owners'?(revoked?null:{app_id:app,verification_level:'domain_verified'}):table==='public_apps'?{id:app}:table==='app_revenue_bindings'?{...binding}:table==='app_revenue_connections'?{...connection}:table==='app_stripe_price_mappings'?mappings:[]});
  const chain={select:()=>chain,eq:()=>chain,is:()=>chain,maybeSingle:async()=>result(),single:async()=>result(),update:()=>chain,insert:(rows:unknown[])=>{inserted=true;points.push(...rows);return chain;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return chain;}
 const first={id:'sub_one',status:'active',livemode:true,items:{data:[{price:price('price_first','1000'),quantity:1}]},discounts:resolvedDiscount?["di_fixture"]:discount?[{}]:[]};
 const second={id:'sub_two',status:'active',livemode:true,items:{data:[{price:price('price_new','12000','year'),quantity:1}]}};
 const fetcher=vi.fn(async(input:string)=>{const url=new URL(input);const data=url.pathname==='/v1/subscriptions/sub_one'?{...first,discounts:resolvedDiscount?[{id:'di_fixture',object:'discount',start:10,end:null,coupon:{duration:'forever',percent_off:20,amount_off:null}}]:first.discounts}:url.pathname==='/v1/account'?{id:oauth.REVENUE_PUBLISHER_ACCOUNT}:url.pathname==='/v1/prices'?{data:[{...price('price_first','1000'),active:false},price('price_new','12000','year')],has_more:false}:url.searchParams.has('price')?{data:[first],has_more:false}:url.searchParams.has('starting_after')?{data:[second],has_more:false}:{data:[first],has_more:true};return Response.json(data);});
 let handler!:(r:Request)=>Promise<Response>;
 const globals={...oauth,...mrr,createClient:(_u:string,k:string)=>k==='service'?{from,rpc}:{auth:{getUser:async()=>({data:{user:{id:user}},error:null})}},Deno:{env:{get:(n:string)=>env[n]},serve:(h:typeof handler)=>{handler=h;}},fetch:fetcher,verifyRevenuePublisher:(k:string)=>oauth.verifyRevenuePublisher(k,fetcher as typeof fetch)};
 new Function(...Object.keys(globals),compiled)(...Object.values(globals));
 const post=(extra:Record<string,unknown>={})=>handler(new Request('https://example.supabase.co',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({action:'sync',app_id:app,...extra})}));
 return {post,rpc,points,fetcher};
}
describe('real Stripe revenue handler account scope',()=>{
 it('syncs a whole account without a manual mapping, paginates and includes archived and new prices',async()=>{
  const f=await fixture();const response=await f.post({revenue_scope:'account'});expect(response.status).toBe(200);
  expect((await response.json()).sync.currencies[0]).toMatchObject({mrr_minor:'2000.000000',verification_status:'verified',included_subscriptions:2});
  expect(f.points[0]).toMatchObject({mapping_version:2,source_livemode:true});
  expect(f.rpc.mock.calls.find(([name])=>name==='configure_app_stripe_revenue')?.[1].p_prices).toHaveLength(2);
  expect(f.fetcher.mock.calls.filter(([url])=>url.includes('/subscriptions')).every(([url])=>!new URL(url).searchParams.has('price'))).toBe(true);
 });
 it('preserves an existing product mapping and does not include unrelated subscriptions',async()=>{
  const f=await fixture({products:true});const response=await f.post();expect(response.status).toBe(200);
  expect((await response.json()).sync.currencies[0].mrr_minor).toBe('1000.000000');
  expect(f.rpc.mock.calls.some(([n])=>n==='configure_app_stripe_revenue')).toBe(false);
 });
 it('fails closed on unsupported subscriptions and reports a non-sensitive reason',async()=>{
  const f=await fixture({discount:true});const data=await (await f.post({revenue_scope:'account'})).json();
  expect(data.sync.currencies[0]).toMatchObject({verification_status:'unsupported',unsupported_subscriptions:1,unsupported_reasons:{subscription_discount:1}});
 });
 it('resolves a permanent coupon through the read-only subscription endpoint before calculation',async()=>{
  const f=await fixture({resolvedDiscount:true});const data=await (await f.post({revenue_scope:'account'})).json();
  expect(data.sync.currencies[0]).toMatchObject({mrr_minor:'1800.000000',verification_status:'verified'});
  expect(f.fetcher.mock.calls.some(([url])=>url.includes('/subscriptions/sub_one?expand[]=discounts'))).toBe(true);
 });
 it('rejects cross-app account conflicts without recording a verified point',async()=>{
  const f=await fixture({conflict:true});expect((await f.post({revenue_scope:'account'})).status).toBe(409);expect(f.points).toEqual([]);
 });
 it('rejects revoked ownership before any Stripe reads',async()=>{
  const f=await fixture({revoked:true});expect((await f.post({revenue_scope:'account'})).status).toBe(403);expect(f.fetcher).not.toHaveBeenCalled();
 });
 it('rejects unknown scopes before any Stripe reads',async()=>{
  const f=await fixture();expect((await f.post({revenue_scope:'anything'})).status).toBe(400);expect(f.fetcher).not.toHaveBeenCalled();
 });
});
