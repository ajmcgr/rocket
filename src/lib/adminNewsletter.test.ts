import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  home: vi.fn(),
  search: vi.fn(),
  collections: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/homeMerchandising", () => ({
  loadHomeMerchandising: mocks.home,
}));
vi.mock("@/lib/marketplace", () => ({ marketplaceRpc: mocks.search }));
vi.mock("@/lib/collections", () => ({
  publicCollections: mocks.collections,
  collectionPath: (row: { slug: string }) => `/collections/${row.slug}`,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { loadNewsletterSections, newsletterCopy } from "./adminNewsletter";

const app = (id: string, name = id) => ({
  id,
  name,
  slug: id,
  tagline: `${name} helps teams work`,
  description: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.home.mockResolvedValue({
    picks: [{ app: app("editorial") }],
    rising: [{ app: app("rising") }],
    top: [{ app: app("ranked") }],
    fresh: [{ app: app("new") }],
    categories: [{ category: "Productivity", app_count: 12 }],
  });
  mocks.search.mockResolvedValue({
    data: { apps: [app("recent"), app("featured")], total: 2 },
    error: null,
  });
  mocks.collections.mockResolvedValue([
    {
      id: "collection",
      slug: "public-list",
      name: "Useful tools",
      app_count: 3,
    },
  ]);
  mocks.rpc.mockResolvedValue({
    data: [
      {
        sponsorship_id: "slot-1",
        sponsorship_type: "featured_app",
        app_id: "featured",
        category: null,
      },
      {
        sponsorship_id: "slot-2",
        sponsorship_type: "category_sponsor",
        app_id: "sponsor",
        category: "AI Agents",
      },
    ],
    error: null,
  });
  mocks.from.mockReturnValue({
    select: () => ({
      in: async () => ({
        data: [app("featured"), app("sponsor")],
        error: null,
      }),
    }),
  });
});

describe("Rocket newsletter draft", () => {
  it("copies live discovery sections with ads labelled in their designated sections", async () => {
    const sections = await loadNewsletterSections();
    expect(sections.map((section) => section.title)).toEqual([
      "Discover",
      "Our picks",
      "Rising",
      "Rankings",
      "Collections",
      "New & Noteworthy",
      "Categories",
    ]);
    expect(sections[0].entries[0]).toMatchObject({
      title: "featured",
      sponsored: true,
    });
    expect(sections[0].entries.map((entry) => entry.title)).toEqual([
      "featured",
      "recent",
    ]);
    expect(sections[4].entries[0].url).toBe(
      "https://tryrocket.ai/collections/public-list",
    );
    expect(
      sections[6].entries.find(
        (entry) => entry.title === "sponsor · AI Agents",
      ),
    ).toMatchObject({ sponsored: true });
    expect(sections[1].entries[0]).toMatchObject({ title: "editorial" });
    expect(sections[2].entries[0].sponsored).toBeUndefined();
    const copy = newsletterCopy(sections);
    expect(copy.plain).toContain("Sponsored · featured");
    expect(copy.plain).toContain("New & Noteworthy");
    expect(copy.html).toContain(
      '<strong style="color:#167ac6">Sponsored · </strong>',
    );
    expect(copy.html).toMatch(/^<h2 /);
    expect(copy.html).not.toContain("<div");
    expect(mocks.collections).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("active_rocket_sponsorships", {
      p_category: null,
    });
  });

  it("escapes public app text before putting it on the rich clipboard", () => {
    const copy = newsletterCopy([
      {
        key: "new",
        title: "New",
        description: "Fresh",
        entries: [
          {
            title: '<img src=x onerror="oops">',
            subtitle: "A & B",
            url: "https://tryrocket.ai/apps/safe",
          },
        ],
      },
    ]);
    expect(copy.html).toContain("&lt;img src=x onerror=&quot;oops&quot;&gt;");
    expect(copy.html).toContain("A &amp; B");
    expect(copy.html).not.toContain("<img src=x");
  });
});
