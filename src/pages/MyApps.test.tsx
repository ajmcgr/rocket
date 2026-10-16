import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { describe, expect, it, vi } from "vitest";
import AppJourney from "@/components/AppJourney";
import MyApps from "./MyApps";
const integrationStatuses = vi.hoisted(() => ({ responses: {} as Record<string, unknown> }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner" }, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        in: async () => ({
          data: [{ id: "app-owned", slug: "owned-app" }],
          error: null,
        }),
      }),
    })),
    functions: {
      invoke: vi.fn(async (_endpoint, options) => ({
        data:
          options.body.action === "my_apps"
            ? [
                {
                  id: "claim-owned",
                  app_id: "app-owned",
                  owned: true,
                  owner_verification_level: "domain_verified",
                  status: "verified",
                  app: { name: "Owned app" },
                },
                {
                  id: "claim-pending",
                  app_id: "app-pending",
                  owned: false,
                  status: "pending",
                  app: { name: "Pending app" },
                },
              ]
            : integrationStatuses.responses[options.body.provider || _endpoint] || {
                connection: null,
                ga4: false,
                posthog: false,
                stripe_revenue: false,
                stripe_payments: false,
              },
        error: null,
      })),
    },
  },
}));

const item = {
  id: "claim-1",
  app_id: "app-1",
  status: "verified",
  verification_state: "domain_verified",
  owned: false,
  owner_verification_level: null,
  app: { name: "Example", website_url: "https://example.com" },
};

describe("My Apps next actions", () => {
  it("shows app cards and the submission action while keeping settings off the index", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <MyApps />
          </MemoryRouter>,
        );
      });
      expect(
        container.querySelector('a[href="/submit"]')?.textContent,
      ).toContain("Submit my app");
      expect(
        container.querySelector('a[href="/my-apps/app-owned"]')?.textContent,
      ).toContain("Owned app");
      expect(
        container.querySelector('a[href="/my-apps/app-pending"]')?.textContent,
      ).toContain("Pending app");
      expect(container.textContent).not.toContain("Domain verified");
      expect(container.textContent).toContain("Claim pending");
      expect(
        container.querySelector('[aria-label="Owned app analytics preview"]'),
      ).toBeNull();
      expect(
        container.querySelector('[aria-label="Manage app connections"]'),
      ).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
  const render = async (owned: boolean) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AppJourney
            item={{
              ...item,
              owned,
              owner_verification_level: owned ? "domain_verified" : null,
            }}
          />
        </MemoryRouter>,
      );
    });
    return {
      container,
      cleanup: async () => {
        await act(async () => {
          root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
      },
    };
  };

  it("does not claim ownership from a stale verified claim after owner revocation", async () => {
    const { container, cleanup } = await render(false);
    try {
      expect(container.textContent).toContain("Prove this app is yours");
      expect(
        container.querySelector('a[href="/apps/add?app=app-1"]'),
      ).not.toBeNull();
      expect(container.textContent).not.toContain("Domain verified");
      expect(container.textContent).not.toContain("Connect Google Analytics");
      expect(container.textContent).not.toContain("Connect Stripe");
    } finally {
      await cleanup();
    }
  });

  it("shows domain verification only for an active owner relationship", async () => {
    const { container, cleanup } = await render(true);
    try {
      expect(container.textContent).toContain("Domain verified");
      expect(container.textContent).toContain("Connect Google Analytics");
      expect(container.textContent).toContain("Connect Stripe");
      const connections = container.querySelector(
        '[aria-label="Connect analytics and revenue"]',
      );
      expect(connections?.classList.contains("grid-cols-1")).toBe(true);
      expect(connections?.querySelectorAll('a[href="/my-apps/app-1/analytics"]')).toHaveLength(2);
      expect(connections?.querySelectorAll('a[href="/my-apps/app-1/revenue"]')).toHaveLength(4);
      expect(connections?.textContent).toContain("Connect RevenueCat");
      expect(connections?.textContent).toContain("Connect Polar");
      expect(connections?.textContent).toContain("Connect Dodo Payments");
      expect(connections?.textContent).not.toContain("Coming soon");
      expect(
        connections
          ?.querySelector('a[href="/my-apps/app-1/analytics"]')
          ?.classList.contains("min-h-24"),
      ).toBe(true);
      expect(
        container.querySelector('a[href="/my-apps/app-1/analytics"] svg'),
      ).not.toBeNull();
      expect(
        container.querySelector('a[href="/my-apps/app-1/revenue"] svg'),
      ).not.toBeNull();
      expect(container.textContent).toContain("Payment setup is separate");
    } finally {
      await cleanup();
    }
  });

  it("shows connected and manage for each linked integration", async () => {
    for (const endpoint of ["rocket-ga4", "rocket-posthog", "rocket-stripe-revenue", "rocket-revenuecat", "polar", "dodo"]) {
      integrationStatuses.responses[endpoint] = { connection: { status: "active" }, source: {} };
    }
    const { container, cleanup } = await render(true);
    try {
      const cards = container.querySelectorAll('[aria-label="Connect analytics and revenue"] a');
      expect(cards).toHaveLength(6);
      for (const card of cards) {
        expect(card.textContent).toContain("Connected");
        expect(card.textContent).toContain("Manage");
        expect(card.textContent).not.toMatch(/Connect (Google Analytics|PostHog|Stripe|RevenueCat|Polar|Dodo Payments)/);
      }
    } finally {
      integrationStatuses.responses = {};
      await cleanup();
    }
  });

  it("distinguishes unfinished setup, sync errors, and unavailable status from disconnected integrations", async () => {
    integrationStatuses.responses = {
      "rocket-ga4": { connection: { status: "select_property" } },
      "rocket-posthog": { connection: { status: "error" } },
      "rocket-stripe-revenue": { error: "Unavailable" },
      "rocket-revenuecat": { connection: { status: "active" }, source: null },
      polar: { connection: { status: "disconnected" } },
    };
    const { container, cleanup } = await render(true);
    try {
      const cards = container.querySelectorAll('[aria-label="Connect analytics and revenue"] a');
      expect(cards[0].textContent).toContain("Finish setup");
      expect(cards[1].textContent).toContain("Needs attention");
      expect(cards[2].textContent).toContain("Status unavailable");
      expect(cards[2].textContent).not.toContain("Connect Stripe");
      expect(cards[3].textContent).toContain("Finish setup");
      expect(cards[4].textContent).toContain("Connect Polar");
      expect(cards[5].textContent).toContain("Connect Dodo Payments");
    } finally {
      integrationStatuses.responses = {};
      await cleanup();
    }
  });
});
