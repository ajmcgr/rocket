// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SponsoredPlacement from "./SponsoredPlacement";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
  it("attributes category website visits without replacing advertiser tracking", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: { placements: [{
      sponsorship_id: "sponsor-1", sponsorship_type: "category_sponsor", category: "Productivity",
      destination_url: "https://example.com/?utm_campaign=custom&coupon=SAVE#pricing",
      app: { id: "app-1", name: "Example", slug: "example", tagline: null, logo_url: null },
    }] }, error: null });
    render(<SponsoredPlacement category="Productivity" />);
    const link = await screen.findByRole("link", { name: "Visit website", exact: true });
    expect(link.getAttribute("href")).toBe("https://example.com/?utm_campaign=custom&coupon=SAVE&utm_source=rocket&utm_medium=display&utm_content=category#pricing");
    expect(screen.queryByRole("link", { name: "View app" })).toBeNull();
  });
});
