import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RocketAppAnalytics, { type RocketAnalytics } from "./RocketAppAnalytics";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), user: { id: "owner" } as { id: string } | null, id: "app-1" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: mocks.id }), Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
const data: RocketAnalytics = { app_id: "app-1", app_name: "Example", from: "2026-09-05", to: "2026-10-04", days: 30, page: 1, page_size: 10, profile_views: 12, total_profile_views: 25, review_count: 3, period_review_count: 2, average_rating: 4.5, save_count: 6, updated_at: "2026-10-04T00:00:00Z", daily_views: [{ day: "2026-10-04", views: 12 }], rating_distribution: [{ stars: 5, count: 2 }, { stars: 4, count: 1 }], reviews: [{ id: "review", rating: 5, body: "Really useful app", created_at: "2026-10-04T00:00:00Z" }] };
beforeEach(() => { mocks.user={id:"owner"}; mocks.id="app-1"; mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue({ data, error: null }); });
afterEach(cleanup);
describe("Rocket app analytics", () => {
  it("shows Rocket metrics, rating stars, review comments and distinct measurement scopes", async () => {
    render(<RocketAppAnalytics />);
    expect(await screen.findByRole("heading", { name: "Example" })).toBeTruthy();
    expect(screen.getByText("4.5 / 5")).toBeTruthy();
    expect(screen.getByText("Really useful app")).toBeTruthy();
    expect(screen.getByLabelText("5 out of 5 stars")).toBeTruthy();
    expect(screen.getByText(/not your website traffic/)).toBeTruthy();
    expect(screen.getByText(/not unique people across/)).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledWith("rocket-app-analytics", { body: { app_id: "app-1", days: 30, page: 1 } });
  });
  it("requests a new range and resets review pagination", async () => {
    render(<RocketAppAnalytics />); await screen.findByText("Really useful app");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenLastCalledWith("rocket-app-analytics", { body: { app_id: "app-1", days: 7, page: 1 } }));
  });
  it("paginates comments through the backend", async () => {
    mocks.invoke.mockResolvedValue({ data: { ...data, period_review_count: 12 }, error: null });
    render(<RocketAppAnalytics />); fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenLastCalledWith("rocket-app-analytics", { body: { app_id: "app-1", days: 30, page: 2 } }));
  });
  it("shows no ratings and an honest empty period", async () => {
    mocks.invoke.mockResolvedValue({ data: { ...data, profile_views: 0, average_rating: null, review_count: 0, period_review_count: 0, reviews: [] }, error: null });
    render(<RocketAppAnalytics />);
    expect(await screen.findByText("No ratings yet")).toBeTruthy();
    expect(screen.getByText("No published reviews in this period.")).toBeTruthy();
  });
  it("never renders failure as zero activity", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    render(<RocketAppAnalytics />); expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("No ratings yet")).toBeNull();
  });
  it("does not fetch when signed out", async () => {
    mocks.user=null; render(<RocketAppAnalytics />);
    expect(await screen.findByRole("link", { name: "Log in to see your app analytics" })).toBeTruthy();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
