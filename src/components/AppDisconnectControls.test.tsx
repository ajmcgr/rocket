import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppDisconnectControls from "./AppDisconnectControls";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const item = { id: "claim", app_id: "app", status: "verified", verification_state: "domain_verified", owned: true, owner_verification_level: "domain_verified", app: { name: "Example" } };
const connections = { ga4: true, posthog: true, stripe_revenue: true, stripe_payments: true };
beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: connections, error: null }); });
afterEach(cleanup);

describe("App disconnect controls", () => {
  it("requires confirmation and lets cancellation leave the app unchanged", async () => {
    const onDisconnected = vi.fn(); render(<AppDisconnectControls item={item} onDisconnected={onDisconnected} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect app" }));
    expect(screen.getByRole("dialog").textContent).toContain("Its public listing stays");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(invoke).toHaveBeenCalledTimes(1); expect(onDisconnected).not.toHaveBeenCalled();
  });
  it("only removes the card after successful server unlink", async () => {
    const onDisconnected = vi.fn(); render(<AppDisconnectControls item={item} onDisconnected={onDisconnected} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect app" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));
    await waitFor(() => expect(onDisconnected).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenLastCalledWith("rocket-app-disconnect", { body: { app_id: "app", action: "app" } });
  });
  it("preserves the app and shows backend safety errors", async () => {
    const onDisconnected = vi.fn(); render(<AppDisconnectControls item={item} onDisconnected={onDisconnected} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Stripe payments" }));
    invoke.mockResolvedValueOnce({ data: { error: "Customers require support" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Customers require support");
    expect(onDisconnected).not.toHaveBeenCalled();
  });
  it.each([["Google Analytics", "rocket-ga4", "disconnect"], ["Stripe revenue verification", "rocket-stripe-revenue", "disconnect"], ["PostHog", "rocket-app-disconnect", "posthog"]])("disconnects %s via its scoped endpoint", async (label, endpoint, action) => {
    render(<AppDisconnectControls item={item} onDisconnected={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: `Disconnect ${label}` }));
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith(endpoint, { body: { app_id: "app", action } }));
  });
  it("does not offer disconnect for an absent integration", async () => {
    invoke.mockResolvedValue({ data: { ga4: false, posthog: false, stripe_revenue: false, stripe_payments: false }, error: null });
    render(<AppDisconnectControls item={item} onDisconnected={vi.fn()} />);
    await screen.findByRole("button", { name: "Disconnect app" });
    expect(screen.queryByRole("button", { name: "Disconnect PostHog" })).toBeNull();
  });
});
