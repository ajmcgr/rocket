// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SponsoredPlacement from "./SponsoredPlacement";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { placements: [] }, error: null })),
    },
  },
}));

describe("category sponsorship loading", () => {
  it("shows a card skeleton until the placement lookup finishes", async () => {
    render(<SponsoredPlacement category="Productivity" />);
    expect(screen.getByRole("status", { name: "Loading sponsored app" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Loading sponsored app" })).toBeNull(),
    );
  });
});
