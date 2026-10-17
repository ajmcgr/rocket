import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import { getDoc } from "@/content/rocketDocs";
import Docs from "./Docs";

vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
beforeEach(() => vi.stubGlobal("scrollTo", vi.fn()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Rocket Docs", () => {
  it("provides usable search results and recovers from an empty search", async () => {
    render(
      <MemoryRouter>
        <Docs />
      </MemoryRouter>,
    );
    const input = await screen.findByRole("searchbox", {
      name: "Search Rocket Docs",
    });
    fireEvent.change(input, { target: { value: "PostHog" } });
    expect(
      await screen.findByRole("heading", { name: "Search results" }),
    ).toBeTruthy();
    const results = screen.getByRole("region", { name: "Search results" });
    expect(
      within(results)
        .getByRole("link", { name: /Connect PostHog/ })
        .getAttribute("href"),
    ).toBe("/docs/posthog");
    fireEvent.change(input, { target: { value: "no-guide-matches-this" } });
    expect(screen.getByRole("status").textContent).toContain("0 guides");
    fireEvent.click(screen.getByRole("button", { name: "Browse all guides" }));
    expect(
      screen.getByRole("heading", { name: "Make Rocket work for you." }),
    ).toBeTruthy();
  });
  it("renders section anchors and pagination from serialized loader data", async () => {
    const article = JSON.parse(JSON.stringify(getDoc("google-analytics")));
    render(
      <MemoryRouter initialEntries={["/docs/google-analytics"]}>
        <Docs article={article} />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Connect Google Analytics",
      }),
    ).toBeTruthy();
    const next = screen.getByRole("navigation", { name: "Related guides" });
    expect(
      within(next)
        .getByRole("link", { name: /Next.*Connect PostHog/ })
        .getAttribute("href"),
    ).toBe("/docs/posthog");
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(
      within(toc)
        .getByRole("link", { name: "Before connecting" })
        .getAttribute("href"),
    ).toBe("#prepare");
    expect(document.getElementById("prepare")).toBeTruthy();
  });
});
