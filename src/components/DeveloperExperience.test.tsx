import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import DeveloperExperience, {
  type DeveloperMembership,
} from "./DeveloperExperience";

vi.mock("@/components/SiteHeader", () => ({
  default: () => <header>Site header</header>,
}));
vi.mock("@/components/SiteFooter", () => ({
  default: () => <footer>Site footer</footer>,
}));
vi.mock("@/components/ProductionBuySetup", () => ({
  default: () => <div>Payment configuration</div>,
}));
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
const membership: DeveloperMembership = {
  active: true,
  membership: { status: "active", current_period_end: "2030-01-01" },
  owned_apps: [{ app_id: "owned-app", verification_level: "claimed" }],
};
async function render({
  member = null,
  signedIn = false,
  clients = [],
  view = "all",
}: {
  member?: DeveloperMembership | null;
  signedIn?: boolean;
  clients?: any[];
  view?: "all" | "account" | "id" | "buy";
} = {}) {
  invoke.mockImplementation(async (name, options) => {
    if (name === "rocket-buy")
      return {
        data: { platform_fee_bps: 725, live_checkout_enabled: false },
        error: null,
      };
    if (name === "rocket-apps")
      return {
        data: [
          {
            app_id: "owned-app",
            owned: true,
            app: {
              name: "Care Pods",
              logo_url: "https://example.com/logo.png",
            },
          },
          { app_id: "other-app", owned: true, app: { name: "Not mine" } },
        ],
        error: null,
      };
    if (name === "rocket-buy-developer")
      return {
        data: {
          merchant: null,
          products: [],
          platform_fee_bps: 725,
          launch_ready: false,
        },
        error: null,
      };
    return { data: null, error: null };
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const billing = vi.fn();
  await act(async () => {
    root.render(
      <MemoryRouter>
        <DeveloperExperience
          view={view}
          signedIn={signedIn}
          loading={false}
          membership={member}
          clients={clients}
          busy={false}
          error=""
          onBilling={billing}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );
  });
  return {
    container,
    billing,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}
describe("Developer product experience", () => {
  it("splits the public products into their own pages", async () => {
    for (const view of ["id", "buy"] as const) {
      const { container, cleanup } = await render({ view });
      try {
        expect(container.querySelector(view === "id" ? "#rocket-id" : "#buy-with-rocket")).not.toBeNull();
        expect(container.querySelector(view === "id" ? "#buy-with-rocket" : "#rocket-id")).toBeNull();
        expect(container.querySelector("h1")?.textContent).toContain(view === "id" ? "Rocket account" : "Buy with Rocket");
        expect(container.querySelector('a[href="/settings/developer"]')).not.toBeNull();
      } finally { await cleanup(); }
    }
  });
  it("shows subscription details and portal controls in settings without public product sections", async () => {
    const { container, billing, cleanup } = await render({ view: "account", signedIn: true, member: { ...membership, membership: { status: "canceling", current_period_end: "2030-01-01" } } });
    try {
      expect(container.textContent).toContain("canceling");
      expect(container.textContent).toContain("Access ends");
      expect(container.textContent).toContain("$99/year");
      expect(container.querySelector("#rocket-id")).toBeNull();
      expect(container.querySelector("#your-developer-apps")).toBeNull();
      expect(container.textContent).not.toContain("Site header");
      await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Manage subscription")!.click());
      expect(billing).toHaveBeenCalledWith("portal");
    } finally { await cleanup(); }
  });
  it("explains identity, payments and account-level price without sign-in", async () => {
    const { container, cleanup } = await render();
    try {
      expect(container.querySelector("h1")?.textContent).toBe(
        "Monetize your app with Rocket.",
      );
      expect(container.textContent).toContain("One account for your app.");
      expect(container.textContent).toContain("Sell access to your app.");
      expect(container.textContent).toContain(
        "Identity + payments, connected.",
      );
      expect(container.textContent).toContain(
        "Per developer account, not per app.",
      );
      expect(container.textContent).toContain("7.25% Rocket fee");
      expect(container.textContent).not.toContain("10% Rocket fee");
      expect(container.textContent).toContain("EXAMPLE ONLY");
      expect(container.textContent).toContain("Rocket consent");
      for (const legacy of [
        "Developer pilot",
        "Invite a test developer",
        "Create invite",
        "sandbox tools",
        "Rocket Connect · Test mode",
      ])
        expect(container.textContent).not.toContain(legacy);
      expect(
        container.querySelector('a[href="/login?next=%2Fsettings%2Fdeveloper"]'),
      ).not.toBeNull();
      expect(
        [...container.querySelectorAll("button")].some((button) =>
          button.textContent?.includes("Copy integration prompt"),
        ),
      ).toBe(false);
    } finally {
      await cleanup();
    }
  });
  it("gives a free owner contextual membership CTAs and no setup controls", async () => {
    const { container, billing, cleanup } = await render({
      signedIn: true,
      member: { ...membership, active: false },
    });
    try {
      expect(container.textContent).toContain("Care Pods");
      expect(container.textContent).not.toContain("Not mine");
      expect(container.textContent).toContain("Rocket Developer required");
      expect(container.querySelector("#developer-setup")).toBeNull();
      await act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent === "Join Rocket Developer")!
          .click(),
      );
      expect(billing).toHaveBeenCalledWith("checkout");
    } finally {
      await cleanup();
    }
  });
  it("puts an active member's owned apps before explanations and enables only a safe prompt", async () => {
    const clients = [
      {
        app_id: "owned-app",
        client_id: "public-client",
        name: "Care Pods",
        is_active: true,
        environment: "production",
        redirect_uris: ["https://example.com/callback"],
      },
    ];
    const { container, cleanup } = await render({
      signedIn: true,
      member: membership,
      clients,
    });
    try {
      expect(container.textContent).toContain("Active");
      expect(container.textContent!.indexOf("Care Pods")).toBeLessThan(
        container.textContent!.indexOf("One account for your app."),
      );
      expect(container.textContent).toContain("Stripe setup");
      expect(container.textContent).not.toContain("Developer pilot");
      expect(container.textContent).not.toContain("Create invite");
      expect(container.querySelector("#developer-setup")).not.toBeNull();
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === "Copy integration prompt",
        ),
      ).toBe(true);
      expect(
        container.querySelector("#developer-setup .dev-coding"),
      ).not.toBeNull();
      expect(container.textContent).not.toContain("Access denied");
    } finally {
      await cleanup();
    }
  });
  it("gives an active member without apps a free first-app action", async () => {
    const { container, cleanup } = await render({
      signedIn: true,
      member: { ...membership, owned_apps: [] },
    });
    try {
      expect(container.textContent).toContain("Add your first app.");
      expect(
        container.querySelector('#your-developer-apps a[href="/submit"]'),
      ).not.toBeNull();
      expect(container.querySelector("#developer-setup")).toBeNull();
    } finally {
      await cleanup();
    }
  });
});
