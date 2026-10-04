import { describe, expect, it } from "vitest";
import { registeredApplicationFee } from "../../supabase/functions/_shared/connectPaymentRules";
import { isolatedLiveWebhookSecret } from "../../supabase/functions/_shared/connectLiveConfiguration";

describe("registered Buy with Rocket fee", () => {
  it.each([[1000,50],[2000,100],[9900,495],[100,5],[101,5],[110,6]])("5%% on %i cents is %i cents", (gross,fee) => {
    expect(registeredApplicationFee(gross,500)).toBe(fee);
  });
  it("preserves the recorded historical rate", () => {
    expect(registeredApplicationFee(1000,1000)).toBe(100);
  });
  it("rejects invalid minor units and rates", () => {
    expect(() => registeredApplicationFee(10.5,500)).toThrow();
    expect(() => registeredApplicationFee(100,-1)).toThrow();
  });
  it("rejects a missing, invalid or copied Create billing webhook secret", () => {
    expect(isolatedLiveWebhookSecret()).toBeNull();
    expect(isolatedLiveWebhookSecret("invalid")).toBeNull();
    expect(isolatedLiveWebhookSecret("whsec_billing", "whsec_billing")).toBeNull();
    expect(isolatedLiveWebhookSecret("whsec_connect", "whsec_billing")).toBe("whsec_connect");
  });
});
