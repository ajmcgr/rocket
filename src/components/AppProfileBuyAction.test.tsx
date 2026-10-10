import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: { id: "buyer" } as { id: string } | null,
  invoke: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mock.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke } },
}));
import AppProfileBuyAction from "./AppProfileBuyAction";
import "../../public/buttons/v1/rocket-buttons.js";
const launch = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
describe("controlled acceptance Buy action", () => {
  it("passes a ready one-time offer's exact key and return URI with a stable purchase request", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/eligible");
    mock.user = { id: "buyer" };
    mock.invoke.mockReset().mockImplementation(async (_name, options) => {
      if (options.body.action === "catalog") return { data: { plan: {
        id: "plan", name: "Eligible", amount_cents: 3900, currency: "usd",
        interval: null, billing_type: "one_time", product_key: "eligible-key",
        return_uri: "https://merchant.example/access",
      } }, error: null };
      if (options.body.action === "status") return { data: { plan: null, entitlement: null }, error: null };
      return { data: { error: "unavailable" }, error: null };
    });
    const container = document.createElement("div"), root = createRoot(container);
    try {
      await act(async () => root.render(<AppProfileBuyAction appId="eligible" appName="Eligible" websiteUrl="https://merchant.example" />));
      const button = container.querySelector("rocket-button")!;
      expect(button).not.toBeNull();
      await act(async () => button.dispatchEvent(new Event("rocket-activate")));
      await act(async () => button.dispatchEvent(new Event("rocket-activate")));
      const checkoutBodies = mock.invoke.mock.calls.filter(([, options]) => options.body.action === "checkout").map(([, options]) => options.body);
      expect(checkoutBodies).toHaveLength(2);
      expect(checkoutBodies[0]).toMatchObject({
        app_id: "eligible", product_key: "eligible-key", return_uri: "https://merchant.example/access",
        purchase_request_id: expect.any(String),
      });
      expect(checkoutBodies[1].purchase_request_id).toBe(checkoutBodies[0].purchase_request_id);
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
  it("shows only the server-eligible pilot and requires one-time-payment agreement", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/launch?acceptance=1");
    mock.user = { id: "buyer" };
    mock.invoke
      .mockReset()
      .mockImplementation(async (name) => ({
        data:
          name === "launch-rocket-acceptance"
            ? {
                available: true,
                plan: {
                  id: "plan",
                  name: "Acceptance",
                  amount_cents: 3900,
                  currency: "usd",
                  interval: null,
                  billing_type: "one_time",
                },
              }
            : { plan: null, entitlement: null },
        error: null,
      }));
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <AppProfileBuyAction
            appId={launch}
            appName="Launch"
            websiteUrl="https://trylaunch.ai"
          />,
        );
      });
      const button = container
          .querySelector("rocket-button")!
          .shadowRoot!.querySelector("button")!,
        checkbox = container.querySelector("input")!;
      expect(button.disabled).toBe(true);
      expect(container.textContent).toContain("$39.00/one-time");
      expect(container.textContent).toContain("$39 USD one-time Launch Pro");
      await act(async () => checkbox.click());
      expect(button.disabled).toBe(false);
      expect(
        mock.invoke.mock.calls.some(
          ([, options]) => options.body.action === "checkout",
        ),
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
  it("a different app cannot get Launch's private acceptance offer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.history.replaceState(null, "", "/apps/other?acceptance=1");
    mock.invoke
      .mockReset()
      .mockResolvedValue({
        data: { plan: null, entitlement: null },
        error: null,
      });
    const container = document.createElement("div"),
      root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <AppProfileBuyAction
            appId="other-app"
            appName="Other"
            websiteUrl="https://other.test"
          />,
        ),
      );
      expect(
        mock.invoke.mock.calls.some(
          ([name]) => name === "launch-rocket-acceptance",
        ),
      ).toBe(false);
      expect(container.querySelector("button")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      window.history.replaceState(null, "", "/");
      vi.unstubAllGlobals();
    }
  });
});
