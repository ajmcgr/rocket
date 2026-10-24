// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import FeaturedAdRows from "./FeaturedAdRows";

const featuredAdsMock = vi.hoisted(() => ({ loadFeaturedPlacements: vi.fn() }));

vi.mock("@/lib/featuredAds", () => ({
  loadFeaturedPlacements: featuredAdsMock.loadFeaturedPlacements,
  rotateFooterPlacements: (placements: unknown[]) => placements,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("featured homepage inventory", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it.each(["homepage", "footer"] as const)(
    "uses only the chosen ad destination on %s",
    async (surface) => {
      const placement = {
        sponsorship_id: "sponsor-1",
        homepage_slot_id: "homepage_featured_1",
        destination_url: "https://trymedia.ai/",
        app: {
          id: "media-id",
          slug: "media",
          name: "Media",
          tagline: "Find creators",
          logo_url: null,
        },
      };
      featuredAdsMock.loadFeaturedPlacements.mockResolvedValue({
        placements: [placement],
        occupiedSlotIds: [],
      });
      const { unmount } = render(
        <MemoryRouter>
          <FeaturedAdRows slots={[1]} surface={surface} />
        </MemoryRouter>,
      );
      const website = await screen.findByRole("link", {
        name: "Visit website",
        exact: true,
      });
      expect(website.getAttribute("href")).toBe("https://trymedia.ai/");
      expect(website.getAttribute("rel")).toContain("sponsored");
      expect(
        screen.queryByRole("link", { name: "View app", exact: true }),
      ).toBeNull();
      expect(
        screen
          .getByRole("link", { name: "Visit Media website" })
          .getAttribute("href"),
      ).toBe("https://trymedia.ai/");
      unmount();

      featuredAdsMock.loadFeaturedPlacements.mockResolvedValue({
        placements: [{ ...placement, destination_url: null }],
        occupiedSlotIds: [],
      });
      render(
        <MemoryRouter>
          <FeaturedAdRows slots={[1]} surface={surface} />
        </MemoryRouter>,
      );
      expect(
        (
          await screen.findByRole("link", { name: "View app", exact: true })
        ).getAttribute("href"),
      ).toBe("/apps/media?sponsor=sponsor-1");
      expect(
        screen.queryByRole("link", { name: "Visit website", exact: true }),
      ).toBeNull();
      expect(
        screen.getByRole("link", { name: "View Media" }).getAttribute("href"),
      ).toBe("/apps/media?sponsor=sponsor-1");
    },
  );
  it("does not offer a reserved slot as an empty placement", async () => {
    let finishLoading!: (value: {
      placements: [];
      occupiedSlotIds: string[];
    }) => void;
    featuredAdsMock.loadFeaturedPlacements.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLoading = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <FeaturedAdRows slots={[1, 2]} surface="homepage" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole("status", { name: "Loading sponsored app" }),
      ).toHaveLength(2),
    );
    expect(screen.queryByText("Loading sponsored apps…")).toBeNull();
    await act(async () => {
      finishLoading({
        placements: [],
        occupiedSlotIds: ["homepage_featured_1"],
      });
    });
    await waitFor(() =>
      expect(screen.getByText("Sponsored placement reserved")).toBeTruthy(),
    );
    expect(screen.getAllByText("YOUR AD HERE")).toHaveLength(1);
    expect(screen.getAllByText("Buy ad")).toHaveLength(1);
  });
});
