import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import DiscoveryPreview from "./DiscoveryPreview";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("./RocketPicks", () => ({ default: () => null }));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({ saved: false }),
}));
vi.mock("@/lib/appMedia", () => ({
  coverMedia: () => null,
  loadAppMedia: async () => new Map(),
}));
vi.mock("@/lib/appCardMetadata", () => ({
  loadAppCardMetadata: async () => new Map(),
}));
vi.mock("@/lib/publicMarketplaceCache", () => ({
  publicMarketplaceRead: (_: string, _key: string, load: () => unknown) =>
    load(),
}));
vi.mock("./MarketplaceCards", () => ({
  EditorialAppCard: () => null,
  StandardAppCard: ({ app }: any) => <article>{app.name}</article>,
  RankedAppRow: ({ app, rank }: any) => (
    <article>
      {rank}. {app.name}
    </article>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.from.mockImplementation((table: string) => {
    let lookup = false;
    const chain: any = {};
    for (const name of ["select", "order", "limit"]) chain[name] = () => chain;
    chain.in = () => {
      lookup = true;
      return chain;
    };
    chain.then = (resolve: any) =>
      Promise.resolve({
        data:
          table === "public_discoverable_apps"
            ? lookup
              ? [
                  { id: "a", name: "Alpha" },
                  { id: "b", name: "Beta" },
                ]
              : [{ id: "n", name: "New app" }]
            : [],
        error: null,
      }).then(resolve);
    return chain;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("Discover preview uses the same engagement RPC and preserves its order", async () => {
  mocks.rpc.mockResolvedValue({
    data: [
      { app_id: "b", rank_position: 1 },
      { app_id: "a", rank_position: 2 },
    ],
    error: null,
  });
  render(
    <MemoryRouter>
      <DiscoveryPreview />
    </MemoryRouter>,
  );
  await screen.findByText("1. Beta");
  expect(screen.getAllByRole("article").map((a) => a.textContent)).toEqual([
    "1. Beta",
    "2. Alpha",
    "New app",
  ]);
  expect(mocks.rpc).toHaveBeenCalledWith("get_public_app_rankings", {
    p_category: "",
    p_limit: 20,
  });
  expect(
    mocks.from.mock.calls.some(([table]) => table === "public_app_rankings"),
  ).toBe(false);
  expect(
    screen.getByText("Ranked by reviews, bookmarks and verified purchases."),
  ).toBeTruthy();
});
it("Missing ranking RPC hides that rail's results while retaining New apps", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "Not deployed" },
  });
  render(
    <MemoryRouter>
      <DiscoveryPreview />
    </MemoryRouter>,
  );
  await screen.findByText("New app");
  expect(screen.getByText("Rankings are unavailable right now.")).toBeTruthy();
  expect(screen.getAllByRole("article")).toHaveLength(1);
});
