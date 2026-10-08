import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import Discover from "./Discover";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  queries: [] as { table: string; range?: number[]; orders: string[] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/hooks/useDocumentMeta", () => ({ useDocumentMeta: () => null }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/appMedia", () => ({ loadAppMedia: async () => new Map() }));
vi.mock("@/lib/appCardMetadata", () => ({
  loadAppCardMetadata: async () => new Map(),
}));
vi.mock("@/lib/publicMarketplaceCache", () => ({
  publicMarketplaceRead: (_scope: string, _key: string, load: () => unknown) =>
    load(),
}));
vi.mock("@/components/MarketplaceCards", () => ({
  StandardAppCard: ({ app }: { app: { name: string } }) => (
    <article>{app.name}</article>
  ),
  RankedAppRow: ({ app, rank }: any) => (
    <article>
      {rank}. {app.name}
    </article>
  ),
  MarketplaceListRow: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.queries.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("New app feed pagination", () => {
  it("shows 24 newest listings and navigates forward/back without requiring Launch signals", async () => {
    vi.stubGlobal("scrollTo", vi.fn());
    mocks.queries.length = 0;
    mocks.rpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: {
          apps: Array.from(
            { length: Math.min(24, 50 - args.p_offset) },
            (_, i) => ({
              id: `app-${args.p_offset + i}`,
              name: `App ${args.p_offset + i + 1}`,
            }),
          ),
          total: 50,
        },
        error: null,
      }),
    );
    mocks.from.mockImplementation((table: string) => {
      const query = {
        table,
        orders: [] as string[],
        range: undefined as number[] | undefined,
      };
      mocks.queries.push(query);
      const builder: any = {};
      for (const method of [
        "select",
        "contains",
        "or",
        "not",
        "in",
        "limit",
        "eq",
      ])
        builder[method] = () => builder;
      builder.order = (column: string) => {
        query.orders.push(column);
        return builder;
      };
      builder.range = (start: number, end: number) => {
        query.range = [start, end];
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "public_discoverable_apps"
              ? Array.from(
                  { length: Math.min(24, 50 - (query.range?.[0] || 0)) },
                  (_, i) => ({
                    id: `app-${(query.range?.[0] || 0) + i}`,
                    name: `App ${(query.range?.[0] || 0) + i + 1}`,
                  }),
                )
              : [],
          count: table === "public_discoverable_apps" ? 50 : 0,
          error: null,
        }).then(resolve);
      return builder;
    });
    render(
      <MemoryRouter initialEntries={["/discover?view=new"]}>
        <Discover />
      </MemoryRouter>,
    );
    await screen.findByText("App 1");
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "search_marketplace",
      expect.objectContaining({
        p_offset: 0,
        p_limit: 24,
        p_sort: "discovered",
      }),
    );
    expect(
      mocks.queries.some(
        (q) => q.table === "public_discoverable_app_intelligence",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("App 25");
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "search_marketplace",
      expect.objectContaining({ p_offset: 24 }),
    );
    expect(screen.queryByText("App 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("App 1");
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeTruthy());
  });
});

describe("engagement rankings", () => {
  function setup(error: any = null) {
    mocks.rpc.mockResolvedValue({
      data: [
        { app_id: "b", rank_position: 1 },
        { app_id: "a", rank_position: 2 },
      ],
      error,
    });
    mocks.from.mockImplementation((table: string) => {
      mocks.queries.push({ table, orders: [] });
      const builder: any = {};
      for (const method of ["select", "order", "in", "limit", "eq"])
        builder[method] = () => builder;
      builder.then = (resolve: any) =>
        Promise.resolve({
          data:
            table === "public_discoverable_apps"
              ? [
                  { id: "a", name: "Alpha" },
                  { id: "b", name: "Beta" },
                ]
              : table === "public_ranking_categories"
                ? [{ category: "Productivity", app_count: 30 }]
                : [],
          error: null,
        }).then(resolve);
      return builder;
    });
  }
  it("uses the bounded engagement RPC and preserves server ranking/category order", async () => {
    setup();
    render(
      <MemoryRouter
        initialEntries={["/discover?view=rankings&category=Productivity"]}
      >
        <Discover />
      </MemoryRouter>,
    );
    await screen.findByText("1. Beta");
    expect(screen.getAllByRole("article").map((a) => a.textContent)).toEqual([
      "1. Beta",
      "2. Alpha",
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_app_rankings", {
      p_category: "Productivity",
      p_limit: 20,
    });
    expect(
      mocks.queries.some(
        (q) =>
          q.table === "public_app_rankings" || q.table.startsWith("connect_"),
      ),
    ).toBe(false);
    expect(
      screen.getByText(/Published reviews, current bookmarks/),
    ).toBeTruthy();
  });
  it("shows an error instead of silently substituting page-view rankings", async () => {
    setup({ message: "Ranking service unavailable" });
    render(
      <MemoryRouter initialEntries={["/discover?view=rankings"]}>
        <Discover />
      </MemoryRouter>,
    );
    await screen.findByRole("alert");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(mocks.queries.some((q) => q.table === "public_app_rankings")).toBe(
      false,
    );
  });
});
