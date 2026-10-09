import { describe, it, expect, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from, rpc: db.rpc },
}));
vi.mock("./appMedia", () => ({
  loadAppMedia: vi.fn(() => Promise.resolve(new Map())),
  coverMedia: (rows: any[] = []) =>
    rows.find(
      (r) => r.media_type === "thumbnail" || r.media_type === "screenshot",
    ),
}));
import {
  composeHome,
  emptyMerchandising,
  tractionLabel,
  loadHomeMerchandising,
  risingQuery,
} from "./homeMerchandising";
const now = Date.parse("2026-10-07T12:00:00Z");
const app = (id: string) =>
  ({
    id,
    name: id,
    logo_url: "https://example.invalid/logo.png",
    tagline: "A real useful app for independent software builders",
    discovered_at: "2026-10-06T00:00:00Z",
  }) as any;
const signal = (app_id: string) =>
  ({
    app_id,
    signal_type: "rising",
    net_votes: 21,
    percentile_rank: 0.9,
  }) as any;
const evidence = (app_id: string) =>
  ({
    app_id,
    provider: "ga4",
    visibility: "verified_only",
    value: 98765,
    metric_type: "active_users",
    metric_date: "2026-10-06",
  }) as any;
const base = () => ({
  apps: [app("a"), app("b"), app("c")],
  picks: [] as any[],
  rising: [] as any[],
  fresh: [] as any[],
  rankedIds: [] as string[],
  evidence: [] as any[],
  categories: [],
  media: new Map<string, any[]>([
    [
      "a",
      [
        {
          media_type: "thumbnail",
          source_url: "https://example.invalid/image.png",
        },
      ],
    ],
  ]),
  now,
});
describe("truthful homepage merchandising", () => {
  it("keeps public rankings and categories when optional editorial/signals queries fail", async () => {
    db.rpc.mockResolvedValue({
      data: [{ app_id: "b", rank_position: 1 }],
      error: null,
    });
    db.from.mockImplementation((table) => {
      const rows =
        table === "public_app_rankings"
          ? [{ app_id: "b", rocket_view_count: 12 }]
          : table === "public_discoverable_apps"
            ? [app("b")]
            : table === "public_app_categories"
              ? [{ category: "Productivity", app_count: 8 }]
              : [];
      const result = {
        data: rows,
        error:
          table === "public_rocket_picks" ||
          table === "public_discoverable_app_intelligence"
            ? new Error("Optional module failure")
            : null,
      };
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gt: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: any) => Promise.resolve(result).then(resolve),
      };
      return chain;
    });
    const result = await loadHomeMerchandising();
    expect(result.top.map((row) => row.app.id)).toEqual(["b"]);
    expect(result.categories[0].category).toBe("Productivity");
    expect(result.picks).toEqual([]);
    expect(result.rising[0].viewCount).toBe(12);
    expect(db.rpc).toHaveBeenCalledWith("get_public_app_rankings", {
      p_category: "",
      p_limit: 8,
    });
    expect(
      db.from.mock.calls.every(([table]) => table.startsWith("public_")),
    ).toBe(true);
  });
  it("does not invent picks, evidence or activity to fill empty shelves", () =>
    expect(composeHome(base())).toEqual({
      ...emptyMerchandising(),
      media: Object.fromEntries(base().media),
    }));
  it("keeps engagement ranking order and Rocket view evidence separate", () => {
    const result = composeHome({
      ...base(),
      rankedIds: ["b", "a"],
      rising: [
        { app_id: "c", rocket_view_count: 21 },
        { app_id: "a", rocket_view_count: 10 },
      ],
    });
    expect(result.top.map((r) => r.app.id)).toEqual(["b", "a"]);
    expect(result.rising[0].viewCount).toBe(21);
    expect(result.rising[0].signal).toBeUndefined();
  });
  it("only accepts human-controlled picks for currently discoverable apps", () => {
    const result = composeHome({
      ...base(),
      picks: [
        { app_id: "missing", placement: "lead" },
        { app_id: "a", placement: "standard", headline: null },
        { app_id: "b", placement: "lead", headline: "Approved headline" },
      ],
    });
    expect(result.picks.map((r) => r.app.id)).toEqual(["b", "a"]);
    expect(result.picks[1].pick?.headline).toBeNull();
  });
  it("requires recent listing, real description, logo and media for noteworthy apps", () => {
    const input = base();
    input.apps.push(
      { ...app("old"), discovered_at: "2020-01-01" },
      { ...app("future"), discovered_at: "2027-01-01" },
    );
    const result = composeHome({
      ...input,
      fresh: ["a", "b", "old", "future"].map(signal),
    });
    expect(result.fresh.map((r) => r.app.id)).toEqual(["a"]);
  });
  it("hides evidence with fewer than three distinct eligible apps", () =>
    expect(
      composeHome({
        ...base(),
        evidence: [evidence("a"), evidence("a"), evidence("b")],
      }).traction,
    ).toEqual([]));
  it("never treats Stripe, GitHub URLs or private numbers as verified usage", () => {
    expect(tractionLabel({ ...evidence("a"), provider: "stripe" })).toBeNull();
    expect(
      tractionLabel({ ...evidence("a"), visibility: "private" }),
    ).toBeNull();
    expect(tractionLabel(evidence("a"))).toBe(
      "Usage verified by Google Analytics",
    );
    expect(tractionLabel(evidence("a"))).not.toContain("98765");
    expect(
      composeHome({ ...base(), evidence: ["a", "b", "c"].map(evidence) })
        .traction,
    ).toHaveLength(3);
    expect(
      JSON.stringify(
        composeHome({ ...base(), evidence: ["a", "b", "c"].map(evidence) })
          .traction,
      ),
    ).not.toContain("98765");
  });
  it("only creates shelves from real editorial collection labels with two eligible apps", () => {
    const result = composeHome({
      ...base(),
      picks: [
        { app_id: "a", collection: "Editors shelf" },
        { app_id: "b", collection: "Editors shelf" },
        { app_id: "missing", collection: "Other" },
        { app_id: "c", collection: null },
      ],
    });
    expect(result.collections.map((c) => c.name)).toEqual(["Editors shelf"]);
    expect(result.collections[0].items).toHaveLength(2);
  });
});

it("Rising queries positive Rocket views with deterministic ordering", () => {
  const chain: any = {};
  for (const name of ["select", "gt", "order", "limit"])
    chain[name] = vi.fn(() => chain);
  db.from.mockReturnValue(chain);
  risingQuery(24);
  expect(db.from).toHaveBeenLastCalledWith("public_app_rankings");
  expect(chain.gt).toHaveBeenCalledWith("rocket_view_count", 0);
  expect(chain.order.mock.calls.map(([column]: string[]) => column)).toEqual([
    "rocket_view_count",
    "last_viewed_at",
    "launched_at",
    "app_id",
  ]);
  expect(chain.limit).toHaveBeenCalledWith(24);
});
