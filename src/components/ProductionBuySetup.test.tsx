import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import ProductionBuySetup from "./ProductionBuySetup";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

async function render(launchReady: boolean, confirmed: boolean) {
  invoke.mockClear();
  invoke.mockResolvedValue({
    data: {
      merchant: { ready: true, status: "active" },
      platform_fee_bps: 825,
      launch_ready: launchReady,
      products: [
        {
          id: "plan-id",
          name: "App access",
          amount_cents: 1900,
          interval: "month",
          platform_fee_bps: 825,
          is_active: false,
          integration_confirmed_at: confirmed ? "2026-10-01" : null,
        },
      ],
    },
    error: null,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ProductionBuySetup
          ownedApps={[{ app_id: "owned-app", name: "Care Pods" }]}
        />
      </MemoryRouter>,
    ),
  );
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}
describe("Buy with Rocket activation UI", () => {
  it("registers one-time pricing and the merchant's exact return URI without activating it", async () => {
    const { container, cleanup } = await render(false, false);
    try {
      const billing = container.querySelectorAll("select")[1];
      await act(async () => {
        billing.value = "one_time";
        billing.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const inputs = container.querySelectorAll("input");
      const values = ["Launch Pro", "39.00", "https://trylaunch.ai/my-products?success=true"];
      await act(async () => {
        inputs.forEach((input, index) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, values[index]);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
      });
      await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(invoke).toHaveBeenCalledWith("rocket-buy-developer", {
        body: { action: "create_plan", app_id: "owned-app", name: "Launch Pro", amount_cents: 3900, interval: "one_time", billing_type: "one_time", payment_return_uri: values[2] },
      });
      expect(invoke.mock.calls.some(([, options]) => options.body.action === "activate_plan")).toBe(false);
    } finally { await cleanup(); }
  });
  it("keeps activation disabled until both live readiness and entitlement verification are server-confirmed", async () => {
    for (const [ready, confirmed] of [
      [false, true],
      [true, false],
    ]) {
      const { container, cleanup } = await render(ready, confirmed);
      try {
        const button = [...container.querySelectorAll("button")].find(
          (b) => b.textContent === "Activate Buy with Rocket",
        )!;
        expect(button.disabled).toBe(true);
        expect(container.textContent).toContain("8.25%");
        expect(invoke).toHaveBeenCalledWith("rocket-buy-developer", {
          body: { action: "status", app_id: "owned-app" },
        });
      } finally {
        await cleanup();
      }
    }
  });
  it("uses the existing owner-authorized activation action and exact selected plan", async () => {
    const { container, cleanup } = await render(true, true);
    try {
      const button = [...container.querySelectorAll("button")].find(
        (b) => b.textContent === "Activate Buy with Rocket",
      )!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(invoke).toHaveBeenCalledWith("rocket-buy-developer", {
        body: {
          action: "activate_plan",
          app_id: "owned-app",
          plan_id: "plan-id",
        },
      });
    } finally {
      await cleanup();
    }
  });
});
