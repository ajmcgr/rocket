import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import { emptyMerchandising } from "@/lib/homeMerchandising";
import HomeMerchandising from "./HomeMerchandising";
const mocks = vi.hoisted(() => ({
  user: null as any,
  from: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({ saved: false, onSave: vi.fn() }),
}));
vi.mock("@/lib/appCardMetadata", () => ({
  loadAppCardMetadata: () => Promise.resolve(new Map()),
}));
vi.mock("./MarketplaceCards", () => ({
  EditorialAppCard: ({ app }: any) => <article>{app.name}</article>,
  StandardAppCard: ({ app }: any) => <article>{app.name}</article>,
  RankedAppRow: ({ app }: any) => <article>{app.name}</article>,
}));
const app = {
  id: "a",
  name: "Real app",
  tagline: "Useful app",
  categories: [],
  logo_url: null,
} as any;
async function render(data: any) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let redraw: () => void = () => undefined;
  function Harness() {
    const [, update] = useState(0);
    redraw = () => update((value) => value + 1);
    return <HomeMerchandising data={{ ...data }} />;
  }
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    ),
  );
  return {
    container,
    refresh: async () => {
      await act(async () => redraw());
    },
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
describe("homepage section gates", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
    mocks.user = null;
    mocks.from.mockReset();
  });
  it("clears private shelves when switching accounts or signing out", async () => {
    mocks.user = { id: "controlled-a" };
    mocks.from.mockImplementation((table) => {
      let owner = "";
      const chain: any = {
        select: () => chain,
        eq: (_: string, value: string) => {
          owner = value;
          return chain;
        },
        like: () => chain,
        order: () => chain,
        in: () => Promise.resolve({ data: [app], error: null }),
        limit: () =>
          Promise.resolve({
            data:
              table === "saved_apps" && owner === "controlled-a"
                ? [{ app_id: "a" }]
                : [],
            error: null,
          }),
      };
      return chain;
    });
    const view = await render(emptyMerchandising());
    try {
      expect(view.container.textContent).toContain("Continue exploring");
      mocks.user = { id: "controlled-b" };
      await view.refresh();
      expect(view.container.textContent).not.toContain("Continue exploring");
      mocks.user = null;
      mocks.from.mockClear();
      await view.refresh();
      expect(view.container.textContent).not.toContain("Real app");
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
  it("shows no empty or private sections to signed-out visitors and makes no private requests", async () => {
    const view = await render(emptyMerchandising());
    try {
      expect(view.container.querySelectorAll("section")).toHaveLength(0);
      expect(mocks.from).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  });
  it("keeps section order and distinguishes views from engagement rankings", async () => {
    const data = {
      ...emptyMerchandising(),
      picks: [{ app, pick: { headline: "Actual editorial reason" } }],
      rising: [{ app, viewCount: 20 }],
      fresh: [{ app }],
      top: [{ app }],
      categories: [{ category: "Productivity", app_count: 8 }],
    };
    const view = await render(data);
    try {
      expect(
        [...view.container.querySelectorAll("h2")].map((h) => h.textContent),
      ).toEqual([
        "Rocket Picks",
        "Rising on Rocket",
        "New & Noteworthy",
        "Top Ranked Apps",
        "Categories",
      ]);
      expect(view.container.textContent).toContain(
        "Most viewed app pages on Rocket.",
      );
      expect(view.container.textContent).toContain(
        "Ranked by reviews, bookmarks and verified purchases.",
      );
      expect(view.container.textContent).not.toContain("community votes");
      expect(view.container.textContent).toContain("Actual editorial reason");
      expect(view.container.textContent).not.toContain("Proven Traction");
    } finally {
      await view.close();
    }
  });
  it("hides personalized shelves on empty data or failure without affecting public content", async () => {
    mocks.user = { id: "controlled-a" };
    mocks.from.mockImplementation(() => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        like: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
      };
      return chain;
    });
    const view = await render({ ...emptyMerchandising(), top: [{ app }] });
    try {
      expect(view.container.textContent).toContain("Top Ranked Apps");
      expect(view.container.textContent).not.toContain("Continue exploring");
      expect(view.container.textContent).not.toContain(
        "From developers you follow",
      );
    } finally {
      await view.close();
    }
  });
});
