import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifiedProviderSelection } from "./VerifiedProviderSelection";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: {
    analytics_provider: "posthog", revenue_provider: "stripe",
    connected: { ga4: true, stripe: true },
  }, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("verified provider selection", () => {
  it("requires confirmation and sends the expected previous source when switching", async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    render(<VerifiedProviderSelection appId="app-1" kind="analytics" />);
    fireEvent.click(await screen.findByRole("button", { name: "Use verified Google Analytics" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("rocket-app-provider-selection", {
      body: { action: "select", app_id: "app-1", kind: "analytics", provider: "ga4",
        expected_previous: "posthog", confirm_switch: true },
    }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("leaves the source untouched when the owner cancels", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    render(<VerifiedProviderSelection appId="app-1" kind="analytics" />);
    fireEvent.click(await screen.findByRole("button", { name: "Use verified Google Analytics" }));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not offer an unavailable provider", async () => {
    invoke.mockResolvedValue({ data: {
      analytics_provider: null, revenue_provider: null,
      connected: { ga4: false, stripe: false },
    }, error: null });
    render(<VerifiedProviderSelection appId="app-1" kind="revenue" />);
    await screen.findByText("None selected");
    expect(screen.queryByRole("button", { name: /Use verified Stripe/ })).toBeNull();
  });
});
