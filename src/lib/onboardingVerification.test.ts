import {describe,it,expect} from "vitest";
import {verificationReturnPath,canShowOnboarding} from "./onboarding";
describe("verification welcome handoff",()=>{
  it("requests the existing welcome on ordinary landing pages and retains attribution",()=>{
    expect(verificationReturnPath("/discover")).toBe("/discover?welcome=1");
    expect(verificationReturnPath("/discover?utm_source=post&utm_content=signup")).toBe("/discover?utm_source=post&utm_content=signup&welcome=1");
    expect(canShowOnboarding("/discover","?welcome=1&utm_content=signup")).toBe(true);
  });
  it.each(["/claim-invitation?token=secret","/apps/add?app=owned","/submit","/connect/authorize?client_id=app","/my-apps/owned/revenue?stripe=connected","/your-apps?checkout=success","/discover?next=%2Fclaim-invitation"])("preserves the intended destination %s",next=>{
    expect(verificationReturnPath(next)).toBe(next);
  });
  it("does not permit open redirects",()=>{
    expect(verificationReturnPath("https://evil.com")).toBe("/discover?welcome=1");
    expect(verificationReturnPath("//evil.com")).toBe("/discover?welcome=1");
  });
});
