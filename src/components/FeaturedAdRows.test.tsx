// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/test/MemoryRouter";
import FeaturedAdRows from "./FeaturedAdRows";

vi.mock("@/lib/featuredAds", () => ({
  loadFeaturedPlacements: () =>
    Promise.resolve({
      placements: [],
      occupiedSlotIds: ["homepage_featured_1"],
    }),
  rotateFooterPlacements: () => [],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

describe("featured homepage inventory", () => {
  it("does not offer a reserved slot as an empty placement", async () => {
    render(
      <MemoryRouter>
        <FeaturedAdRows slots={[1, 2]} surface="homepage" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("Sponsored placement reserved")).toBeTruthy(),
    );
    expect(screen.getAllByText("YOUR AD HERE")).toHaveLength(1);
    expect(screen.getAllByText("Buy ad")).toHaveLength(1);
  });
});
