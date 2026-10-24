import {describe,expect,it,vi} from 'vitest';
import {recordGrowthRequest} from '../../supabase/functions/_shared/growthTracking';
const id='00000000-0000-4000-8000-000000000001';
const req=()=>new Request('https://example.invalid',{headers:{Authorization:'Bearer test-token'}});
const admin=()=>({rpc:vi.fn(async()=>({data:true,error:null})),auth:{getUser:vi.fn(async()=>({data:{user:{id:'server-user',email_confirmed_at:'2026-10-24',created_at:'2026-10-24T09:00:00Z'}},error:null}))}});
describe('Server growth event boundary',()=>{
  it('binds signup to the confirmed server user, never a client-supplied account',async()=>{
    const a=admin();
    const result=await recordGrowthRequest(req(),{kind:'referral_signup',event_id:id,referral_id:id,user_id:'attacker',account_created_at:'2000-01-01'},a,'a'.repeat(64));
    expect(result.status).toBe(200);
    expect(a.rpc.mock.calls[0][1]).toMatchObject({p_user_id:'server-user',p_referral_id:id,p_account_created_at:'2026-10-24T09:00:00Z'});
  });
  it('rejects forged outcomes and unconfirmed signup requests',async()=>{
    const a=admin();
    expect((await recordGrowthRequest(req(),{kind:'developer_activated',event_id:id},a,'a'.repeat(64))).status).toBe(400);
    a.auth.getUser.mockResolvedValueOnce({data:{user:null},error:null} as any);
    expect((await recordGrowthRequest(req(),{kind:'referral_signup',event_id:id,referral_id:id},a,'a'.repeat(64))).status).toBe(401);
    expect(a.rpc).not.toHaveBeenCalled();
  });
  it('records public share actions without private connection or account data',async()=>{
    const a=admin();
    await recordGrowthRequest(req(),{kind:'share_action',event_id:id,target_kind:'app',identifier:'launch',method:'intent'},a,'b'.repeat(64));
    expect(a.auth.getUser).not.toHaveBeenCalled();
    expect(a.rpc.mock.calls[0][1]).toMatchObject({p_user_id:null,p_account_created_at:null,p_method:'intent',p_identifier:'launch'});
  });
});
