import {act,cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({nav:vi.fn(),invoke:vi.fn(),session:vi.fn(),refresh:vi.fn(),getUser:vi.fn(),search:"?token=verification-token&next=%2Fdiscover"}));
vi.mock("@/lib/router-compat",()=>({useSearchParams:()=>[new URLSearchParams(mock.search)],useNavigate:()=>mock.nav,Link:({to,children}:any)=><a href={to}>{children}</a>}));
vi.mock("@/components/SiteHeader",()=>({default:()=>null}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:vi.fn()})}));
vi.mock("@/lib/beehiivAccountSync",()=>({syncNewAccountToBeehiiv:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:mock.invoke},auth:{getSession:mock.session,refreshSession:mock.refresh,getUser:mock.getUser}}}));
import VerifyEmail from "./VerifyEmail";
beforeEach(()=>{
  vi.useFakeTimers();vi.clearAllMocks();mock.search="?token=verification-token&next=%2Fdiscover";
  mock.session.mockResolvedValue({data:{session:{user:{id:"new-user",email_confirmed_at:null}}}});
  mock.invoke.mockResolvedValue({data:{success:true,user_id:"new-user",signInUrl:"https://auth.example.com/magic"},error:null});
  mock.refresh.mockResolvedValue({data:{user:{id:"new-user",email_confirmed_at:"2026-10-26T01:00:00Z"}},error:null});
});
afterEach(()=>{cleanup();vi.useRealTimers()});
describe("verified email welcome handoff",()=>{
  it("refreshes the confirmed account before returning to the existing welcome",async()=>{
    render(<VerifyEmail/>);await act(async()=>{});
    expect(mock.refresh).toHaveBeenCalledOnce();expect(mock.nav).not.toHaveBeenCalled();
    expect(mock.invoke.mock.calls[0][1].body.next).toBe("/discover?welcome=1");
    await act(async()=>{await vi.advanceTimersByTimeAsync(601)});
    expect(mock.nav).toHaveBeenCalledWith("/discover?welcome=1",{replace:true});
  });
  it.each(["/claim-invitation?token=claim-secret","/connect/authorize?client_id=app","/your-apps?checkout=success"])("preserves %s",async next=>{
    mock.search=`?token=verification-token&next=${encodeURIComponent(next)}`;
    render(<VerifyEmail/>);await act(async()=>{await vi.advanceTimersByTimeAsync(601)});
    expect(mock.invoke.mock.calls[0][1].body.next).toBe(next);
    expect(mock.nav).toHaveBeenCalledWith(next,{replace:true});
  });
  it("does not send a stale session into onboarding when refresh fails, and retains the login destination",async()=>{
    mock.refresh.mockResolvedValue({data:{user:null},error:new Error("Network")});
    render(<VerifyEmail/>);await act(async()=>{await vi.advanceTimersByTimeAsync(601)});
    expect(screen.getByText("Verification failed")).toBeTruthy();expect(mock.nav).not.toHaveBeenCalled();
    expect(screen.getByRole("link",{name:"Back to login"}).getAttribute("href")).toBe("/login?next=%2Fdiscover%3Fwelcome%3D1");
  });
});
