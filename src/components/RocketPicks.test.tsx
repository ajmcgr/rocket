import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import RocketPicks from "./RocketPicks";
const m = vi.hoisted(() => ({
  picks: [] as any[],
  apps: [] as any[],
  error: null as any,
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
vi.mock("@/lib/appMedia", () => ({ loadAppMedia: async () => new Map() }));
vi.mock("@/lib/appCardMetadata", () => ({
  loadAppCardMetadata: async () => new Map(),
}));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({}),
}));
vi.mock("./MarketplaceCards", () => ({
  StandardAppCard: ({ app }: any) => <article>{app.name}</article>,
}));
beforeEach(() => {
  m.picks = [];
  m.apps = [];
  m.error = null;
  m.from.mockImplementation((name: string) => {
    const q: any = {
      then: (f: any) =>
        Promise.resolve({
          data: name === "public_rocket_picks" ? m.picks : m.apps,
          error: name === "public_rocket_picks" ? m.error : null,
        }).then(f),
    };
    for (const k of ["select", "not", "order", "limit", "in"]) q[k] = () => q;
    return q;
  });
});
afterEach(cleanup);
describe("Existing editorial on the storefront", () => {
  it("shows only eligible picks with a supplied reason and filters real collection assignments", async () => {
    m.picks = [
      {
        app_id: "writer",
        headline: "Useful for rewriting drafts.",
        collection: "work",
      },
      {
        app_id: "maker",
        headline: "Make small prototypes.",
        collection: "build",
      },
      { app_id: "hidden", headline: "Not public.", collection: "work" },
      { app_id: "blank", headline: " ", collection: null },
    ];
    m.apps = [
      { id: "writer", name: "Writer" },
      { id: "maker", name: "Maker" },
      { id: "blank", name: "No reason" },
    ];
    render(<RocketPicks />);
    await screen.findByText("Writer");
    expect(
      screen.getByText("Why we picked it: Useful for rewriting drafts."),
    ).toBeTruthy();
    expect(screen.queryByText("Not public.")).toBeNull();
    expect(screen.queryByText("No reason")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Get work done" }));
    expect(screen.queryByText("Maker")).toBeNull();
    expect(screen.getByText(/Not verified usage/)).toBeTruthy();
  });
  it("does not invent editorial picks when administration has none or is unavailable", async () => {
    m.error = { message: "Unavailable" };
    const ui = render(<RocketPicks />);
    await waitFor(() =>
      expect(m.from).toHaveBeenCalledWith("public_rocket_picks"),
    );
    expect(ui.container.textContent).toBe("");
  });
});
