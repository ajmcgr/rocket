// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppMarketplaceContext from "./AppMarketplaceContext";

vi.mock("@/lib/router-compat", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/MarketplaceFollow", () => ({ default: () => null }));
vi.mock("@/components/MarketplaceCards", () => ({
  MarketplaceListRow: ({ app }: { app: { name: string } }) => (
    <article>{app.name}</article>
  ),
}));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({}),
}));
vi.mock("@/lib/marketplace", () => ({
  marketplaceRpc: async (name: string) => ({
    data:
      name === "get_app_developer"
        ? { username: "alex", full_name: "Alex MacGregor" }
        : [
            { id: "app-1", name: "Current app" },
            { id: "app-2", name: "Other app" },
          ],
    error: null,
  }),
  marketplaceTable: (name: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      limit: async () => ({ data: [], error: null }),
    };
    return query;
  },
}));

afterEach(cleanup);

it("credits the verified app developer by public handle, not real name", async () => {
  render(<AppMarketplaceContext appId="app-1" />);
  const byline = await screen.findByRole("link", { name: "@alex" });
  expect(byline.getAttribute("href")).toBe("/@alex");
  expect(byline.parentElement?.textContent).toBe("By @alex");
  expect(screen.queryByText("Alex MacGregor")).toBeNull();
});

it("places developer recommendations after profile evidence and excludes the current app", async () => {
  render(
    <AppMarketplaceContext appId="app-1" beforeDeveloper={<h2>Trust</h2>}>
      <details open>
        <summary>How we know</summary>Public sources
      </details>
    </AppMarketplaceContext>,
  );
  const recommendations = await screen.findByRole("region", {
    name: "More from this developer",
  });
  const developer = screen.getByRole("region", {
    name: "App evaluation and developer",
  });
  expect(
    screen.getByRole("heading", { name: "Trust" }).compareDocumentPosition(developer) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    developer.compareDocumentPosition(screen.getByText("How we know")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen.getByText("How we know").compareDocumentPosition(recommendations) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(recommendations.textContent).toContain("Other app");
  expect(screen.queryByText("Current app")).toBeNull();
});
