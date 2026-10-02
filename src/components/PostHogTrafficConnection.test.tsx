import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
import PostHogTrafficConnection from "./PostHogTrafficConnection";
afterEach(() => {
  cleanup();
  invoke.mockReset();
});
describe("PostHog connection controls", () => {
  it("shows connect and region selection for an unconnected app", async () => {
    invoke.mockResolvedValue({
      data: { connection: null, visibility: [], latest: [] },
    });
    render(<PostHogTrafficConnection appId="app-one" />);
    await screen.findByText("Not connected");
    expect(
      screen.getByRole("button", { name: "Connect PostHog" }),
    ).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("rocket-posthog", {
      body: { action: "status", app_id: "app-one" },
    });
    expect(screen.queryByLabelText("Pageviews PostHog visibility")).toBeNull();
  });
  it("defaults each PostHog metric to private and publishes only its own provider", async () => {
    const status = {
      connection: {
        status: "active",
        property_name: "App project",
        last_error: null,
      },
      visibility: [],
      latest: [],
    };
    invoke.mockResolvedValue({ data: status });
    render(<PostHogTrafficConnection appId="app-two" />);
    const selector = await screen.findByLabelText(
      "Pageviews PostHog visibility",
    );
    expect((selector as HTMLSelectElement).value).toBe("private");
    fireEvent.change(selector, { target: { value: "range" } });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rocket-posthog", {
        body: {
          action: "set_visibility",
          app_id: "app-two",
          metric_type: "views",
          visibility: "range",
        },
      }),
    );
    expect(
      invoke.mock.calls.every(([provider]) => provider === "rocket-posthog"),
    ).toBe(true);
  });
});
