import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { describe, expect, it, vi } from "vitest";
import AppJourney from "@/components/AppJourney";
import MyApps from "./MyApps";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn(async (_endpoint, options) => ({ data: options.body.action === "my_apps" ? [{ id: "claim-owned", app_id: "app-owned", owned: true, owner_verification_level: "domain_verified", status: "verified", app: { name: "Owned app" } }, { id: "claim-pending", app_id: "app-pending", owned: false, status: "pending", app: { name: "Pending app" } }] : { ga4: false, posthog: false, stripe_revenue: false, stripe_payments: false }, error: null })) } } }));

const item = {
  id: "claim-1", app_id: "app-1", status: "verified", verification_state: "domain_verified",
  owned: false, owner_verification_level: null,
  app: { name: "Example", website_url: "https://example.com" },
};

describe("Your Apps next actions", () => {
  it("links Rocket Analytics for owned apps, not pending claims", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<MemoryRouter><MyApps /></MemoryRouter>); });
      expect(container.querySelector('a[href="/my-apps/app-owned/rocket-analytics"]')?.textContent).toContain("Rocket Analytics");
      expect(container.querySelector('a[href="/my-apps/app-pending/rocket-analytics"]')).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  const render = async (owned: boolean) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<MemoryRouter><AppJourney item={{ ...item, owned, owner_verification_level: owned ? "domain_verified" : null }} /></MemoryRouter>); });
    return { container, cleanup: async () => { await act(async () => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); } };
  };

  it("does not claim ownership from a stale verified claim after owner revocation", async () => {
    const { container, cleanup } = await render(false);
    try {
      expect(container.textContent).toContain("Prove this app is yours");
      expect(container.querySelector('a[href="/apps/add?app=app-1"]')).not.toBeNull();
      expect(container.textContent).not.toContain("Domain verified");
      expect(container.textContent).not.toContain("Connect Google Analytics");
      expect(container.textContent).not.toContain("Connect Stripe");
    } finally { await cleanup(); }
  });

  it("shows domain verification only for an active owner relationship", async () => {
    const { container, cleanup } = await render(true);
    try {
      expect(container.textContent).toContain("Domain verified");
      expect(container.textContent).toContain("Connect Google Analytics");
      expect(container.textContent).toContain("Connect Stripe");
      expect(container.querySelector('a[href="/my-apps/app-1/analytics"] svg')).not.toBeNull();
      expect(container.querySelector('a[href="/my-apps/app-1/revenue"] svg')).not.toBeNull();
      expect(container.textContent).toContain("Payment setup is separate");
    } finally { await cleanup(); }
  });
});
