import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {pendingGrowthReferral,recordGrowthShare,referralTarget,syncGrowthAttribution} from './growthTracking';
const {invoke}=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke}}}));
beforeEach(()=>{
  sessionStorage.clear(); invoke.mockReset().mockResolvedValue({data:{ok:true,counted:true},error:null});
  vi.stubGlobal('window',{location:{origin:'https://tryrocket.ai'}});
  vi.stubGlobal('navigator',{doNotTrack:'0',globalPrivacyControl:false});
});
afterEach(()=>vi.unstubAllGlobals());
describe('Private first-party growth attribution',()=>{
  it('accepts only explicitly attributed public app/profile URLs',()=>{
    expect(referralTarget('/apps/launch','?utm_source=rocket_share')).toEqual({kind:'app',identifier:'launch'});
    expect(referralTarget('/@alex','?utm_source=rocket_share')).toEqual({kind:'profile',identifier:'alex'});
    expect(referralTarget('/admin','?utm_source=rocket_share')).toBeNull();
    expect(referralTarget('/apps/launch','?utm_source=other')).toBeNull();
  });
  it('reuses one receipt across refreshes and confirmation, without storing identity or query text',async()=>{
    await syncGrowthAttribution('/apps/launch','?utm_source=rocket_share');
    const id=invoke.mock.calls[0][1].body.event_id;
    await syncGrowthAttribution('/apps/launch','?utm_source=rocket_share');
    expect(invoke.mock.calls[1][1].body.event_id).toBe(id);
    expect(pendingGrowthReferral()).toBe(id);
    await syncGrowthAttribution('/verify-email','',true);
    expect(invoke.mock.calls[2][1].body).toMatchObject({kind:'referral_signup',referral_id:id});
    await syncGrowthAttribution('/admin','',true);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(pendingGrowthReferral()).toBeUndefined();
  });
  it('carries a receipt into another verification tab but leaves eligibility to the server',async()=>{
    const id='00000000-0000-4000-8000-000000000001';
    await syncGrowthAttribution('/verify-email','',true,id);
    expect(invoke.mock.calls[0][1].body).toMatchObject({kind:'referral_signup',referral_id:id});
  });
  it('honors privacy opt-outs and never sends unnecessary data',async()=>{
    vi.stubGlobal('navigator',{globalPrivacyControl:true});
    await recordGrowthShare('app','launch','link');
    await syncGrowthAttribution('/apps/launch','?utm_source=rocket_share');
    expect(invoke).not.toHaveBeenCalled();
    vi.stubGlobal('navigator',{doNotTrack:'1'});
    await recordGrowthShare('profile','alex','intent');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('does not count opening a dialog, unrelated card kinds, or preview traffic',async()=>{
    await recordGrowthShare('collection','one','link');
    expect(invoke).not.toHaveBeenCalled();
    await recordGrowthShare('app','launch','link');
    expect(invoke.mock.calls[0][1].body).toMatchObject({kind:'share_action',target_kind:'app',identifier:'launch',method:'link'});
    vi.stubGlobal('window',{location:{origin:'http://localhost:8080'}});
    await recordGrowthShare('app','launch','link');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('expires attribution and tolerates unavailable storage and network',async()=>{
    sessionStorage.setItem('rocket:growth-referral',JSON.stringify({id:'old',at:Date.now()-8*86400000}));
    await syncGrowthAttribution('/login','',true);
    expect(invoke).not.toHaveBeenCalled();
    invoke.mockRejectedValueOnce(new Error('offline'));
    await expect(recordGrowthShare('app','launch','link')).resolves.toBeUndefined();
  });
});
