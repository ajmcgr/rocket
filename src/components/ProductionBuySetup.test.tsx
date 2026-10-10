import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import ProductionBuySetup from "./ProductionBuySetup";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

async function render(
  pending: null | {
    id: string;
    stripe_account_id: string;
    stripe_account_name: string;
    stripe_account_country: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } = null,
) {
  invoke.mockReset();
  invoke.mockImplementation(
    (name: string, options: { body: { action: string } }) =>
      Promise.resolve(
        name === "rocket-buy-stripe-oauth"
          ? options.body.action === "status"
            ? { data: { pending_account: pending }, error: null }
            : { data: { connected: true }, error: null }
          : {
              data: {
                merchant: {
                  ready: true,
                  status: "active",
                  stripe_account_id: "acct_prior",
                },
                products: [],
                platform_fee_bps: 500,
                launch_ready: false,
              },
              error: null,
            },
      ),
  );
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

describe("agent-driven Buy with Rocket setup", () => {
  it("shows connected merchant and agent workflow without product mapping or live activation controls", async () => {
    const { container, cleanup } = await render();
    try {
      expect(container.textContent).toContain("acct_prior");
      expect(container.textContent).toContain("coding agent");
      expect(container.textContent).toContain("Public checkout remains off");
      expect(container.textContent).not.toContain("Import price");
      expect(container.textContent).not.toContain("Access key");
      expect(container.textContent).not.toContain("Activate Buy with Rocket");
      expect(
        invoke.mock.calls.every(
          ([, options]) => options.body.action === "status",
        ),
      ).toBe(true);
    } finally {
      await cleanup();
    }
  });
  it("requires explicit owner selection when Stripe returns a different merchant", async () => {
    const { container, cleanup } = await render({
      id: "attempt-id",
      stripe_account_id: "acct_launch",
      stripe_account_name: "Launch",
      stripe_account_country: "US",
      charges_enabled: true,
      payouts_enabled: true,
    });
    try {
      expect(container.textContent).toContain("acct_launch");
      expect(container.textContent).toContain("retires previous offers");
      expect(
        invoke.mock.calls.some(
          ([, options]) => options.body.action === "activate",
        ),
      ).toBe(false);
      const button = [...container.querySelectorAll("button")].find(
        (item) => item.textContent === "Use this Stripe account",
      )!;
      await act(async () => button.click());
      expect(invoke).toHaveBeenCalledWith("rocket-buy-stripe-oauth", {
        body: {
          action: "activate",
          app_id: "owned-app",
          attempt_id: "attempt-id",
        },
      });
    } finally {
      await cleanup();
    }
  });
});
