import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHogAnalytics } from "./PostHogAnalytics";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));

beforeEach(() => invoke.mockReset());
afterEach(cleanup);

describe("PostHog owner controls", () => {
  it("keeps stale metrics private while allowing the owner to revoke prior visibility", async () => {
    invoke.mockResolvedValue({ data: {
      connection: { status: "active", project_id: "76403", project_name: "Launch",
        verified_hostname: "trylaunch.ai", last_error: null,
        last_successful_sync: "2026-01-01T00:00:00.000Z" },
      selected: true, active_provider: "posthog", visibility: "exact",
      latest: { metric_date: "2025-12-31", metric_value: 42 },
    }, error: null });
    render(<PostHogAnalytics appId="app-1" />);
    const visibility = await screen.findByRole("combobox", { name: "Public pageview visibility" });
    expect((screen.getByRole("option", { name: "Exact" }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("option", { name: "Private" }) as HTMLOptionElement).disabled).toBe(false);
    expect(screen.getByText(/stale; sync again before sharing/)).toBeTruthy();
    fireEvent.change(visibility, { target: { value: "private" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("rocket-posthog", {
      body: { action: "set_visibility", app_id: "app-1", visibility: "private" },
    }));
  });
});
