import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppAnalyticsPreview from "./AppAnalyticsPreview";
import { MemoryRouter } from "@/test/MemoryRouter";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), owner: { id: "owner" } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.owner, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
let container: HTMLDivElement, root: Root;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const show = async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><AppAnalyticsPreview appId="app-1" appName="Example" /></MemoryRouter>); });
};
const data = { app_id: "app-1", profile_views: 12, period_review_count: 3, save_count: 4, average_rating: 4.5, daily_views: [{ day: "2026-10-01", views: 4 }, { day: "2026-10-02", views: 8 }] };
describe("App analytics preview", () => {
  it("shows real metrics, a trend and the full analytics link", async () => {
    mocks.invoke.mockResolvedValue({ data, error: null }); await show();
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("4.5 / 5");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("daily profile views");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/my-apps/app-1/rocket-analytics");
    expect(mocks.invoke).toHaveBeenCalledWith("rocket-app-analytics", { body: { app_id: "app-1", days: 30, page: 1 } });
  });
  it("does not turn unavailable data into zeroes and supports retry", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Unavailable") }); await show();
    expect(container.textContent).toContain("Analytics preview unavailable");
    expect(container.textContent).not.toContain("Profile views");
    expect(container.querySelector("button")?.textContent).toBe("Retry");
    mocks.invoke.mockResolvedValue({ data, error: null });
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("4.5 / 5");
  });
  it("rejects results belonging to a different app", async () => {
    mocks.invoke.mockResolvedValue({ data: { ...data, app_id: "another-app" }, error: null }); await show();
    expect(container.textContent).toContain("Analytics preview unavailable");
    expect(container.textContent).not.toContain("4.5 / 5");
  });
  it("distinguishes an empty period from missing data", async () => {
    mocks.invoke.mockResolvedValue({ data: { ...data, profile_views: 0, average_rating: null, daily_views: [] }, error: null }); await show();
    expect(container.textContent).toContain("No ratings yet");
    expect(container.textContent).toContain("No recorded profile views");
  });
});
