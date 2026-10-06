import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: { id: "buyer" } as { id: string } | null, invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mock.invoke } } }));
import AppProfileBuyAction from "./AppProfileBuyAction";
const launch = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
describe("controlled acceptance Buy action", () => {
  it("shows only the server-eligible pilot and requires recurring-payment agreement", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/launch?acceptance=1");
    mock.user = { id: "buyer" };
    mock.invoke.mockReset().mockImplementation(async name => ({ data: name === "launch-rocket-acceptance" ? { available: true, plan: { id: "plan", name: "Acceptance", amount_cents: 100, currency: "usd", interval: "month" } } : { plan: null, entitlement: null }, error: null }));
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => { root.render(<AppProfileBuyAction appId={launch} appName="Launch" websiteUrl="https://trylaunch.ai" />); });
      const button = container.querySelector("button")!, checkbox = container.querySelector("input")!;
      expect(button.disabled).toBe(true);
      expect(container.textContent).toContain("$1 USD/month");
      await act(async () => checkbox.click());
      expect(button.disabled).toBe(false);
      expect(mock.invoke.mock.calls.some(([, options]) => options.body.action === "checkout")).toBe(false);
    } finally { await act(async () => root.unmount()); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); }
  });
  it("a different app cannot get Launch's private acceptance offer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/other?acceptance=1");
    mock.invoke.mockReset().mockResolvedValue({ data: { plan: null, entitlement: null }, error: null });
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(<AppProfileBuyAction appId="other-app" appName="Other" websiteUrl="https://other.test" />));
      expect(mock.invoke.mock.calls.some(([name]) => name === "launch-rocket-acceptance")).toBe(false);
      expect(container.querySelector("button")).toBeNull();
    } finally { await act(async () => root.unmount()); window.history.replaceState(null, "", "/"); vi.unstubAllGlobals(); }
  });
});
