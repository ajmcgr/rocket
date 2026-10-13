import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "@/test/MemoryRouter";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MyAppSettings from "./MyAppSettings";

const mocks = vi.hoisted(() => ({ failSource: false, verificationLevel: "domain_verified" }));
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
      invoke: async (
        _name: string,
        options?: { body?: { action?: string } },
      ) =>
        options?.body?.action === "add_source" && mocks.failSource
          ? {
              data: null,
              error: {
                context: new Response(
                  JSON.stringify({
                    error: "Source does not match the verified app website",
                  }),
                  { status: 400 },
                ),
              },
            }
          : {
              data: [
                {
                  id: "claim-owned",
                  app_id: "app-owned",
                  owned: true,
                  owner_verification_level: mocks.verificationLevel,
                  status: "verified",
                  app: {
                    name: "Owned app",
                    slug: "owned-app",
                    website_url: "https://owned.example",
                  },
                },
              ],
              error: null,
            },
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
vi.mock("@/components/AgentIntegrationsPanel", () => ({
  default: () => <div>Agent integration form</div>,
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
    expect(container.textContent).toContain("Agent integration form");
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

it("does not offer Agent Integrations editing to an unverified owner", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.verificationLevel = "claimed";
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/my-apps/app-owned"]}>
        <Routes><Route path="/my-apps/$id" element={<MyAppSettings />} /></Routes>
      </MemoryRouter>,
    ));
    expect(container.textContent).not.toContain("Agent integration form");
    expect(container.querySelector('a[href="#agent-integrations"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    mocks.verificationLevel = "domain_verified";
    vi.unstubAllGlobals();
  }
});

it("keeps app settings available and shows the source validation error", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.failSource = true;
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
    const open = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add public source"),
    );
    await act(async () => {
      fireEvent.click(open!);
    });
    await act(async () => {
      fireEvent.change(
        container.querySelector('input[aria-label="Public source URL"]')!,
        { target: { value: "https://github.com/ajmcgr/launch" } },
      );
      fireEvent.submit(container.querySelector("form")!);
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Source does not match",
    );
    expect(container.textContent).toContain("Owned app");
    expect(container.textContent).toContain("GitHub builds");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    mocks.failSource = false;
    vi.unstubAllGlobals();
  }
});
