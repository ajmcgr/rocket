import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AppAnalytics from "./AppAnalytics";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useParams: () => ({ id: "app-1" }),
}));
vi.mock("@/components/PostHogAnalytics", () => ({ PostHogAnalytics: () => null }));
vi.mock("@/components/VerifiedProviderSelection", () => ({ VerifiedProviderSelection: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("explains GA4 disclosure and sends the unchanged metric and visibility values only on selection", async () => {
  invoke.mockResolvedValue({ data: {
    connection: { status: "active", property_name: "Example" }, visibility: [],
    latest: [{ metric_type: "views", metric_date: "2026-10-25", metric_value: 42 }],
  }, error: null });
  render(<AppAnalytics />);
  const pageviews = await screen.findByRole("combobox", { name: "Pageviews" });
  expect((pageviews as HTMLSelectElement).value).toBe("private");
  expect(screen.getByText(/latest completed day can be shown/).textContent).toContain("not monthly totals");
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.change(pageviews, { target: { value: "range" } });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("rocket-ga4", {
    body: { action: "set_visibility", app_id: "app-1", metric_type: "views", visibility: "range" },
  }));
});
