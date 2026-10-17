import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LaunchPurchaseTestSetup from "./LaunchPurchaseTestSetup";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
afterEach(() => vi.clearAllMocks());
async function render(data: Record<string, unknown>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  invoke.mockResolvedValue({ data, error: null });
  const container = document.createElement("div");
  const root = createRoot(container);
  const verified = vi.fn();
  await act(async () => {
    root.render(
      <LaunchPurchaseTestSetup planId="plan" onVerified={verified} />,
    );
  });
  return { container, root, verified };
}
describe("Launch purchase test setup", () => {
  it("explains real payment and shows the username selection before test checkout", async () => {
    const { container, root, verified } = await render({ configured: false });
    expect(container.textContent).toContain("real $39 USD one-time purchase");
    expect(container.querySelector("input")?.placeholder).toBe("@username");
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(invoke).toHaveBeenCalledWith("launch-rocket-acceptance", {
      body: { action: "setup", plan_id: "plan" },
    });
    expect(verified).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it("shows the private link for the selected tester without initiating checkout", async () => {
    const { container, root } = await render({
      configured: true,
      tester_handle: "tester",
      test_url: "https://tryrocket.ai/apps/launch?acceptance=1",
    });
    expect(container.textContent).toContain("@tester");
    expect(container.querySelector("a")?.href).toBe(
      "https://tryrocket.ai/apps/launch?acceptance=1",
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
  it("refreshes activation status only after server proof is recorded", async () => {
    const { root, verified } = await render({
      configured: true,
      verified: true,
    });
    expect(verified).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });
});
