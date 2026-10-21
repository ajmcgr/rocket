import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at?: string; app_metadata?: { provider: string } },
  location: { pathname: "/stripe-revenue/install", search: "?source=marketplace" },
  verified: false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/lib/router-compat", () => ({
  useLocation: () => mocks.location,
  Navigate: ({ to }: { to: string }) => <a data-testid="redirect" href={to}>Continue</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({
  eq: () => ({ maybeSingle: async () => ({ data: { email_verified: mocks.verified } }) }),
}) }) } }));

afterEach(() => { cleanup(); mocks.user = null; mocks.verified = false; });

describe("protected installation authentication redirects", () => {
  it("keeps the installation destination for signed-out users", async () => {
    render(<ProtectedRoute>Private settings</ProtectedRoute>);
    const url = new URL((await screen.findByTestId("redirect")).getAttribute("href")!, "https://tryrocket.ai");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/stripe-revenue/install?source=marketplace");
  });
  it("keeps the same destination through required email verification", async () => {
    mocks.user = { id: "reviewer", email: "reviewer@example.com" };
    render(<ProtectedRoute>Private settings</ProtectedRoute>);
    const url = new URL((await screen.findByTestId("redirect")).getAttribute("href")!, "https://tryrocket.ai");
    expect(url.pathname).toBe("/verify-email");
    expect(url.searchParams.get("next")).toBe("/stripe-revenue/install?source=marketplace");
    expect(url.searchParams.get("email")).toBe("reviewer@example.com");
    expect(screen.queryByText("Private settings")).toBeNull();
  });
  it("allows the existing confirmed session without another redirect", () => {
    mocks.user = { id: "reviewer", email: "reviewer@example.com", email_confirmed_at: "2026-10-21" };
    render(<ProtectedRoute>Private settings</ProtectedRoute>);
    expect(screen.getByText("Private settings")).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
  });
});
