import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "@/test/MemoryRouter";
import { describe, expect, it, vi } from "vitest";
import MyAppSettings from "./MyAppSettings";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner" }, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async () => ({ data: [{ id: "app-owned", slug: "owned-app" }] }),
      }),
    }),
    functions: {
      invoke: async () => ({
        data: [
          {
            id: "claim-owned",
            app_id: "app-owned",
            owned: true,
            owner_verification_level: "domain_verified",
            status: "verified",
            app: {
              name: "Owned app",
              slug: "owned-app",
              website_url: "https://owned.example",
            },
          },
        ],
        error: null,
      }),
    },
  },
}));
vi.mock("@/components/AppJourney", () => ({
  default: () => <div>Ownership and connections</div>,
}));
vi.mock("@/components/GitHubBuildInfo", () => ({
  default: () => <div>GitHub builds</div>,
}));
vi.mock("@/components/AppAnalyticsPreview", () => ({
  default: () => <div>Analytics preview</div>,
}));
vi.mock("@/components/DeveloperProductCards", () => ({
  default: () => <div>Products</div>,
}));
vi.mock("@/components/AppBadgeKit", () => ({
  default: () => <div>Badge kit</div>,
}));
vi.mock("@/components/AppDisconnectControls", () => ({
  default: () => <div>Disconnect controls</div>,
}));

it("opens an owned app's settings from its card route", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/my-apps/app-owned"]}>
          <Routes>
            <Route path="/my-apps/$id" element={<MyAppSettings />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
    expect(container.textContent).toContain("Owned app");
    expect(container.textContent).toContain("GitHub builds");
    expect(container.textContent).toContain("Ownership and connections");
    expect(
      container.querySelector('a[href="/my-apps/app-owned/edit"]'),
    ).not.toBeNull();
    expect(container.querySelector('a[href="/your-apps"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
