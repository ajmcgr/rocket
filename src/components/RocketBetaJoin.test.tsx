// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import RocketBetaJoin from "./RocketBetaJoin";

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  active: true,
  membership: null as null | { status: string; updates_opt_in: boolean },
  actions: [] as string[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn(async (_name: string, request: { body: { action: string } }) => {
  state.actions.push(request.body.action);
  if (request.body.action === "public_status") return { data: { active: state.active, title: "Test Beta", message: "Help us test", access_type: "approval_required", membership: state.membership }, error: null };
  if (request.body.action === "join") { state.membership = { status: "waitlisted", updates_opt_in: false }; return { data: { status: "waitlisted" }, error: null }; }
  return { data: { ok: true }, error: null };
}) } } }));

afterEach(() => { cleanup(); state.user = null; state.active = true; state.membership = null; state.actions.length = 0; });

it("hides an inactive Beta and never shows private tester details", async () => {
  state.active = false;
  render(<RocketBetaJoin appId="app-1" appSlug="test-app" />);
  await waitFor(() => expect(state.actions).toContain("public_status"));
  expect(screen.queryByRole("region", { name: "Rocket Beta" })).toBeNull();
});

it("requires login to request access and does not promise external product access", async () => {
  render(<RocketBetaJoin appId="app-1" appSlug="test-app" />);
  expect(await screen.findByRole("link", { name: "Log in to request access" })).toHaveProperty("href", expect.stringContaining("/login?next=%2Fapps%2Ftest-app"));
  expect(screen.getByText(/does not automatically grant access/)).toBeTruthy();
  expect(state.actions).toEqual(["public_status"]);
});

it("shows a waitlist state after an authenticated tester joins", async () => {
  state.user = { id: "tester" };
  render(<RocketBetaJoin appId="app-1" appSlug="test-app" />);
  fireEvent.click(await screen.findByRole("button", { name: "Request Beta Access" }));
  expect(await screen.findByText("Your status: Waitlisted")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Email me Beta updates" })).toHaveProperty("checked", false);
  expect(state.actions).toContain("join");
});
