import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminAcquisitionReview from "./AdminAcquisitionReview";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  listings: [{ app_id: "launch-id", app_name: "Launch", status: "open_to_offers", asking_price_cents: null, description: "", reason_for_selling: "", preferred_buyer: "" }],
}));
vi.mock("@/lib/rocketAcquisition", () => ({ acquisitionDb: { rpc: mocks.rpc } }));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "rocket_admin_acquisition_queue" ? mocks.listings : name === "rocket_admin_message_reports" ? [] : {},
    error: null,
  }));
});
afterEach(cleanup);

describe("acquisition listing review", () => {
  it("opens an inline reason form and submits an approval", async () => {
    render(<AdminAcquisitionReview />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const reason = screen.getByRole("textbox", { name: /Reason for approving Launch/ });
    fireEvent.change(reason, { target: { value: "  Ownership confirmed  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("rocket_admin_review_acquisition", {
      p_app_id: "launch-id", p_approve: true, p_reason: "Ownership confirmed",
    }));
    expect((await screen.findByRole("status")).textContent).toContain("Listing approved.");
  });

  it("keeps the listing visible and reports a backend rejection", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "rocket_admin_review_acquisition"
      ? { data: null, error: { message: "Review denied" } }
      : { data: name === "rocket_admin_acquisition_queue" ? mocks.listings : name === "rocket_admin_message_reports" ? [] : {}, error: null });
    render(<AdminAcquisitionReview />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for rejecting Launch/ }), { target: { value: "Not eligible" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Review denied");
    expect(screen.getByRole("textbox", { name: /Reason for rejecting Launch/ })).not.toBeNull();
  });
});
