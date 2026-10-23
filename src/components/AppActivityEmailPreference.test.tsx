import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppActivityEmailPreference from "./AppActivityEmailPreference";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), eq: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-id" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: mocks.eq }), upsert: mocks.save }),
  },
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockReturnValue({ maybeSingle: mocks.read });
  mocks.read.mockResolvedValue({ data: null, error: null });
  mocks.save.mockResolvedValue({ error: null });
});
describe("app activity email preferences", () => {
  it("persists an opt-out for the signed-in user and restores it on reload", async () => {
    const ui = render(<AppActivityEmailPreference />);
    const toggle = ui.getByRole("switch", { name: "App activity emails" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner-id");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      { user_id: "owner-id", enabled: false },
      { onConflict: "user_id" },
    );
    ui.unmount();
    mocks.read.mockResolvedValue({ data: { enabled: false }, error: null });
    const reloaded = render(<AppActivityEmailPreference />);
    await waitFor(() =>
      expect(reloaded.getByRole("switch").getAttribute("aria-checked")).toBe(
        "false",
      ),
    );
  });
  it("does not show a successful opt-out if the server rejects it", async () => {
    mocks.save.mockResolvedValue({ error: { message: "Unavailable" } });
    const ui = render(<AppActivityEmailPreference />);
    const toggle = ui.getByRole("switch");
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    fireEvent.click(toggle);
    await ui.findByRole("alert");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
  it("blocks changes when the saved preference cannot load", async () => {
    mocks.read.mockResolvedValue({
      data: null,
      error: { message: "Unavailable" },
    });
    const ui = render(<AppActivityEmailPreference />);
    await ui.findByRole("alert");
    expect(ui.getByRole("switch").hasAttribute("disabled")).toBe(true);
    fireEvent.click(ui.getByRole("switch"));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
