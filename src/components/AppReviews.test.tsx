import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "@/test/MemoryRouter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppReviews from "./AppReviews";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  reviews: [] as Array<Record<string, unknown>>,
  summary: null as null | { rating_count: number; average_rating: number },
  rpc: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: mocks.reviews, error: null }),
          }),
          maybeSingle: async () => ({
            data: table === "public_app_review_summary" ? mocks.summary : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  },
}));

describe("real app reviews", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.scrollTo = vi.fn();
    mocks.user = null;
    mocks.reviews = [];
    mocks.summary = null;
    mocks.rpc.mockReset();
  });

  it("shows no fabricated rating and asks an anonymous visitor to sign in", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <AppReviews appId="app-1" />
          </MemoryRouter>,
        );
      });
      expect(container.textContent).toContain("No reviews yet");
      expect(container.textContent).not.toContain("0 stars");
      expect(
        container.querySelector('a[href="/login?next=%2Fapps%2Fapp-1"]'),
      ).not.toBeNull();
      expect(container.querySelector("textarea")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shows only actual published review data and lets the author edit", async () => {
    mocks.user = { id: "owner-1" };
    mocks.reviews = [
      {
        id: "review-1",
        app_id: "app-1",
        user_id: "owner-1",
        rating: 4,
        body: "A genuinely useful product.",
        created_at: "2026-09-30T00:00:00Z",
        updated_at: "2026-09-30T00:00:00Z",
      },
    ];
    mocks.summary = { rating_count: 1, average_rating: 4 };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <AppReviews appId="app-1" />
          </MemoryRouter>,
        );
      });
      expect(container.textContent).toContain("from 1 review");
      expect(container.textContent).toContain("A genuinely useful product.");
      expect(container.textContent).toContain("Edit your review");
      expect(
        (container.querySelector("textarea") as HTMLTextAreaElement).value,
      ).toBe("A genuinely useful product.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
