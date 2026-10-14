// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import FeaturedAdRows from "./FeaturedAdRows";

const featuredAdsMock = vi.hoisted(() => ({ loadFeaturedPlacements: vi.fn() }));

vi.mock("@/lib/featuredAds", () => ({
  loadFeaturedPlacements: featuredAdsMock.loadFeaturedPlacements,
  rotateFooterPlacements: () => [],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("featured homepage inventory", () => {
  it("does not offer a reserved slot as an empty placement", async () => {
    let finishLoading!: (value: { placements: []; occupiedSlotIds: string[] }) => void;
    featuredAdsMock.loadFeaturedPlacements.mockImplementation(
      () => new Promise((resolve) => { finishLoading = resolve; }),
    );
    render(
      <MemoryRouter>
        <FeaturedAdRows slots={[1, 2]} surface="homepage" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("status", { name: "Loading sponsored app" })).toHaveLength(2),
    );
    expect(screen.queryByText("Loading sponsored apps…")).toBeNull();
    await act(async () => {
      finishLoading({ placements: [], occupiedSlotIds: ["homepage_featured_1"] });
    });
    await waitFor(() =>
      expect(screen.getByText("Sponsored placement reserved")).toBeTruthy(),
    );
    expect(screen.getAllByText("YOUR AD HERE")).toHaveLength(1);
    expect(screen.getAllByText("Buy ad")).toHaveLength(1);
  });
});
