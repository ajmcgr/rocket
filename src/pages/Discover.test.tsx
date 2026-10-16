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
  invoke: vi.fn(),
  queries: [] as { table: string; range?: number[]; orders: string[] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
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
  MarketplaceListRow: ({ app }: { app: { name: string } }) => (
    <article>{app.name}</article>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("scrollTo", vi.fn());
  mocks.queries.length = 0;
});

it("renders server-loaded category results immediately with crawlable pagination", async () => {
  mocks.from.mockImplementation(() => {
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return builder;
  });
  mocks.invoke.mockResolvedValue({ data: null, error: null });
  const initialSearchData = {
    key: "Productivity:1:launched",
    apps: [{ id: "app-1", name: "Productivity App" }] as never,
    count: 60,
  };
  render(
    <MemoryRouter initialEntries={["/discover?view=all&category=Productivity&page=1"]}>
      <Discover initialSearchData={initialSearchData} />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Productivity App")).toBeTruthy();
  expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Next Productivity apps page" }).getAttribute("href"))
    .toContain("page=2");
  expect(screen.getByRole("link", { name: "Previous Productivity apps page" }).getAttribute("href"))
    .toBe("/discover?view=all&category=Productivity");
  expect(mocks.rpc).not.toHaveBeenCalled();
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

it("passes the MCP Available filter to server-side search before pagination", async () => {
  mocks.rpc.mockResolvedValue({ data: { apps: [], total: 0 }, error: null });
  mocks.from.mockImplementation(() => {
    const builder: any = {};
    for (const method of ["select", "order", "limit", "eq", "in"])
      builder[method] = () => builder;
    builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
    return builder;
  });
  render(<MemoryRouter initialEntries={["/discover?view=all&mcp=available"]}><Discover /></MemoryRouter>);
  const filter = await screen.findByRole("checkbox", { name: "MCP Available" }) as HTMLInputElement;
  expect(filter.checked).toBe(true);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("search_marketplace", expect.objectContaining({
    p_mcp: true, p_offset: 0, p_limit: 24,
  })));
  fireEvent.click(filter);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("search_marketplace", expect.objectContaining({ p_mcp: false })));
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
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_app_rankings_page", {
      p_category: "Productivity",
      p_offset: 0,
      p_limit: 21,
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
  it("shows 20 ranked apps per page and preserves their global ranks", async () => {
    mocks.rpc.mockImplementation((_name, args) => Promise.resolve({
      data: Array.from({ length: 25 }, (_, index) => ({
        app_id: `app-${index + 1}`,
        rank_position: index + 1,
      })).slice(args.p_offset, args.p_offset + args.p_limit),
      error: null,
    }));
    mocks.from.mockImplementation((table: string) => {
      let ids: string[] = [];
      const builder: any = {};
      for (const method of ["select", "order", "limit", "eq"])
        builder[method] = () => builder;
      builder.in = (_column: string, values: string[]) => {
        ids = values;
        return builder;
      };
      builder.then = (resolve: any) => Promise.resolve({
        data: table === "public_discoverable_apps"
          ? ids.map((id) => ({ id, name: `App ${id.slice(4)}` }))
          : [],
        error: null,
      }).then(resolve);
      return builder;
    });
    render(<MemoryRouter initialEntries={["/discover?view=rankings"]}><Discover /></MemoryRouter>);
    await screen.findByText("1. App 1");
    expect(screen.getAllByRole("article")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("21. App 21");
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getByText("Page 2")).toBeTruthy();
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_app_rankings_page", {
      p_category: "",
      p_offset: 20,
      p_limit: 21,
    });
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("1. App 1");
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
