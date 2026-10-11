import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import CuratedApps from "./CuratedApps";

vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({ saved: false, onSave: () => {} }),
}));
vi.mock("@/components/MarketplaceCards", () => ({
  RankedAppRow: ({ app, rank }: { app: { name: string }; rank: number }) => (
    <article>{rank}. {app.name}</article>
  ),
  StandardAppCard: () => null,
}));

beforeEach(() => vi.stubGlobal("scrollTo", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Rising pagination", () => {
  it("shows twenty apps with a next-page link", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      app: { id: `app-${index + 1}`, name: `App ${index + 1}` },
    })) as any;
    render(<MemoryRouter initialEntries={["/rising"]}>
      <CuratedApps kind="rising" rows={rows} page={0} hasMore />
    </MemoryRouter>);
    expect(await screen.findByText("20. App 20")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(20);
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toContain("page=1");
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
  });

  it("continues global ranks on later pages", async () => {
    render(<MemoryRouter initialEntries={["/rising?page=1"]}>
      <CuratedApps
        kind="rising"
        rows={[{ app: { id: "app-21", name: "App 21" } }] as any}
        page={1}
        hasMore={false}
      />
    </MemoryRouter>);
    expect(await screen.findByText("21. App 21")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toContain("page=0");
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });
});
