import { render,screen,fireEvent,waitFor,cleanup } from '@testing-library/react';
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mock.invoke}}}));
vi.mock('@/lib/router-compat',()=>({useParams:()=>({id:'app-fixture'}),useLocation:()=>({search:''}),Link:({children,to}:{children:React.ReactNode;to:string})=><a href={to}>{children}</a>}));
vi.mock('@/components/RevenueCatConnection',()=>({RevenueCatConnection:()=>null}));
vi.mock('@/components/AlternativeRevenueConnection',()=>({AlternativeRevenueConnection:()=>null}));
vi.mock('@/components/VerifiedProviderSelection',()=>({VerifiedProviderSelection:()=>null}));
import AppRevenue from './AppRevenue';
const base={connect_available:true,connection:{status:'active',external_account_id:'acct_fixture',livemode:true},mapping_version:0,revenue_scope:'products',visibility:'private',mappings:[],latest:[]};
afterEach(cleanup);
beforeEach(()=>{mock.invoke.mockReset();});
describe('Stripe MRR scope flow',()=>{
 it('defaults a new connection to total account MRR and syncs without a product picker',async()=>{
  mock.invoke.mockImplementation(async(_name,{body})=>({data:body.action==='status'?base:{sync:{source_livemode:true,currencies:[{verification_status:'verified'}]}}}));
  render(<AppRevenue/>);const scope=await screen.findByLabelText('Revenue scope');expect((scope as HTMLSelectElement).value).toBe('account');
  expect(screen.queryByRole('button',{name:'Load Stripe prices'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Sync total MRR'}));
  await waitFor(()=>expect(mock.invoke).toHaveBeenCalledWith('rocket-stripe-revenue',{body:expect.objectContaining({action:'sync',revenue_scope:'account',app_id:'app-fixture'})}));
 });
 it('keeps saved individual products selected for existing users',async()=>{
  mock.invoke.mockResolvedValue({data:{...base,mappings:[{stripe_price_id:'price_saved'}]}});
  render(<AppRevenue/>);expect(((await screen.findByLabelText('Revenue scope')) as HTMLSelectElement).value).toBe('products');
  expect(screen.getByRole('button',{name:'Load Stripe prices'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Sync selected products'})).toBeTruthy();
 });
 it('retains the individual price picker as an option',async()=>{
  mock.invoke.mockImplementation(async(_name,{body})=>({data:body.action==='catalog'?{prices:[{id:'price_fixture',product_name:'Plan',currency:'usd',unit_amount_decimal:'1000',interval:'month',interval_count:1}]}:base}));
  render(<AppRevenue/>);fireEvent.change(await screen.findByLabelText('Revenue scope'),{target:{value:'products'}});
  fireEvent.click(screen.getByRole('button',{name:'Load Stripe prices'}));
  fireEvent.click(await screen.findByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save price mapping'}));
  await waitFor(()=>expect(mock.invoke).toHaveBeenCalledWith('rocket-stripe-revenue',{body:expect.objectContaining({action:'save_mapping',price_ids:['price_fixture']})}));
 });
 it('explains unsupported totals instead of claiming verification succeeded',async()=>{
  const point={currency:'usd',mrr_minor:'0',observed_at:new Date().toISOString(),source_livemode:true,verification_status:'unsupported',unsupported_subscriptions:1,unsupported_reasons:{subscription_discount:1}};
  mock.invoke.mockImplementation(async(_name,{body})=>({data:body.action==='status'?{...base,revenue_scope:'account',latest:[point]}:{sync:{source_livemode:true,currencies:[point]}}}));
  render(<AppRevenue/>);fireEvent.click(await screen.findByRole('button',{name:'Sync total MRR'}));
  expect(await screen.findByText(/Stripe synced, but a subscription configuration is unsupported/)).toBeTruthy();
  expect(screen.getByText(/Subscription-level discount/)).toBeTruthy();
 });
});
