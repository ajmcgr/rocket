import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";
import ClaimInvitation from "./ClaimInvitation";
import OutreachUnsubscribe from "./OutreachUnsubscribe";

const mocks = vi.hoisted(() => ({
  section: "home",
  denied: false,
  actionError: "",
  requests: [] as { name: string; args: Record<string, unknown> }[],
  snapshot: {} as Record<string, unknown>,
  claims: [] as Record<string, unknown>[],
}));
// Real SDK with an isolated in-memory HTTP transport: an unbound rpc method
// throws before this fetch runs, reproducing the production 'reading rest' error.
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient(
      "https://admin-fixture.invalid",
      "fixture-public-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            const name = String(input).split("/rpc/")[1];
            const args = JSON.parse(String(init?.body || "{}"));
            mocks.requests.push({ name, args });
            if (String(input).includes("/public_apps?")) {
              return new Response(JSON.stringify({ name: "Launch", slug: "launch" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            if (name === "rocket_admin_snapshot" && mocks.denied) {
              return new Response(
                JSON.stringify({
                  code: "42501",
                  message: "Admin access denied",
                }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            if (name === "rocket_admin_action" && mocks.actionError) {
              return new Response(JSON.stringify({ message: mocks.actionError }), {
                status: 400, headers: { "Content-Type": "application/json" },
              });
            }
            const result =
              name === "rocket_admin_snapshot"
                ? mocks.snapshot
                : name === "rocket_redeem_claim_invitation"
                  ? { app_id: args.p_app_id }
                : name === "rocket_admin_claims"
                  ? mocks.claims
                  : name === "rocket_admin_outreach_first_batch" ||
                      name === "rocket_admin_outreach_test_candidates"
                    ? []
                    : null;
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          },
        },
      },
    ),
  };
});
vi.mock("@/lib/router-compat", () => ({
  useParams: () => ({ section: mocks.section }),
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "controlled-fixture-user" }, loading: false }),
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/components/AdminDeveloperTesting", () => ({
  default: () => <p>Authorized developer testing tools</p>,
}));
vi.mock("@/components/AdminMarketplaceOps", () => ({
  default: () => null,
  PickCollection: () => null,
}));
beforeEach(() => {
  mocks.section = "home";
  mocks.denied = false;
  mocks.actionError = "";
  mocks.requests.length = 0;
  mocks.snapshot = { catalogue: { public_apps: 12 } };
  mocks.claims = [];
  sessionStorage.clear();
  window.history.replaceState({}, "", "/admin");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("admin Supabase client binding", () => {
  it.each([
    ["home", "Catalogue"],
    ["metrics", "Catalogue"],
    ["ops", "App reports"],
    ["marketing", "Task collections"],
    ["outreach", "Queue status"],
    ["developer-testing", "Authorized developer testing tools"],
  ])("loads %s using the real SDK", async (section, heading) => {
    mocks.section = section;
    // App reports is mocked; the existing Claims panel proves Ops loaded.
    render(<Admin />);
    await screen.findByText(
      section === "ops" ? /Claims awaiting action/ : heading,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.requests).toContainEqual({
      name: "rocket_admin_snapshot",
      args: {
        p_section: section === "developer-testing" ? "home" : section,
        p_period: "30d",
      },
    });
    if (section === "ops")
      expect(mocks.requests).toContainEqual({
        name: "rocket_admin_claims",
        args: { p_claim: null },
      });
    if (section === "outreach")
      expect(mocks.requests).toContainEqual({
        name: "rocket_admin_outreach_first_batch",
        args: {},
      });
    if (section === "outreach")
      expect(mocks.requests).toContainEqual({
        name: "rocket_admin_outreach_test_candidates",
        args: {},
      });
    expect(mocks.requests.some((r) => r.name === "rocket_admin_action")).toBe(
      false,
    );
  });
  it("preserves server access denial and does not mount developer tools", async () => {
    mocks.section = "developer-testing";
    mocks.denied = true;
    render(<Admin />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Access denied",
    );
    expect(screen.queryByText("Authorized developer testing tools")).toBeNull();
    expect(screen.queryByText("Catalogue")).toBeNull();
  });
  it("refreshes the selected period through the same bound client", async () => {
    render(<Admin />);
    await screen.findByText("Catalogue");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7d" } });
    await waitFor(() =>
      expect(mocks.requests).toContainEqual({
        name: "rocket_admin_snapshot",
        args: { p_section: "home", p_period: "7d" },
      }),
    );
  });
  it("retains action arguments and refreshes after a controlled mock action", async () => {
    mocks.section = "ops";
    mocks.snapshot = {
      reports: [
        {
          id: "fixture-report",
          review_id: "fixture-review",
          review_status: "hidden",
          body: "Fixture",
          reason: "Fixture",
        },
      ],
    };
    render(<Admin />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore review" }),
    );
    await waitFor(() =>
      expect(mocks.requests).toContainEqual({
        name: "rocket_admin_action",
        args: {
          p_action: "restore_review",
          p_target: "fixture-review",
          p_reason: null,
          p_payload: {},
        },
      }),
    );
    await waitFor(() =>
      expect(
        mocks.requests.filter((r) => r.name === "rocket_admin_snapshot"),
      ).toHaveLength(2),
    );
  });
  it("approves a reviewed claim directly without requiring evidence or opening a prompt", async () => {
    mocks.section = "ops";
    mocks.claims = [{ id: "fixture-claim", app_name: "OutageScope", app_url: "https://outagescope.com", status: "review", method: "manual_review", owner_conflict: false }];
    const prompt = vi.spyOn(window, "prompt");
    render(<Admin />);
    const approve = await screen.findByRole("button", { name: "Approve as claimed" });
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("textbox", { name: /Independent ownership evidence/ })).toBeNull();
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.requests).toContainEqual({
      name: "rocket_admin_action",
      args: {
        p_action: "approve_claim",
        p_target: "fixture-claim",
        p_reason: null,
        p_payload: {},
      },
    }));
    expect(prompt).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Claim approved.");
  });
  it("rejects a claim directly without a note prompt", async () => {
    mocks.section = "ops";
    mocks.claims = [{ id: "fixture-claim", app_name: "OutageScope", status: "review", method: "manual_review", owner_conflict: false }];
    const prompt = vi.spyOn(window, "prompt");
    render(<Admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    await waitFor(() => expect(mocks.requests).toContainEqual({
      name: "rocket_admin_action",
      args: { p_action: "reject_claim", p_target: "fixture-claim", p_reason: null, p_payload: {} },
    }));
    expect(prompt).not.toHaveBeenCalled();
  });
  it.each([
    { method: "manual_review", owner_conflict: true },
    { method: "dns", owner_conflict: false },
  ])("keeps approval blocked for conflicts or automatic verification methods: %o", async (claim) => {
    mocks.section = "ops";
    mocks.claims = [{ id: "fixture-claim", app_name: "OutageScope", status: "review", ...claim }];
    render(<Admin />);
    const approve = await screen.findByRole("button", { name: "Approve as claimed" });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows approval failures beside the affected claim", async () => {
    mocks.section = "ops";
    mocks.claims = [{ id: "fixture-claim", app_name: "OutageScope", status: "review", method: "manual_review", owner_conflict: false }];
    mocks.actionError = "Another account already owns this app; ownership was not changed";
    render(<Admin />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve as claimed" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((alert) =>
      alert.closest("article")?.id === "claim-fixture-claim" && alert.textContent === mocks.actionError,
    )).toBe(true));
    expect(screen.queryByText("Claim approved.")).toBeNull();
  });

});

it("redeems a claim invitation using the bound client", async () => {
  const appId = "20000000-0000-4000-8000-000000000001";
  const token = "a".repeat(64);
  window.history.replaceState(
    {},
    "",
    `/claim-invitation?token=${token}&app=${appId}`,
  );
  render(<ClaimInvitation />);
  await screen.findByText(/Your app is now claimed on Rocket/);
  expect(mocks.requests.filter((request) => request.name)).toEqual([
    {
      name: "rocket_redeem_claim_invitation",
      args: { p_token: token, p_app_id: appId },
    },
  ]);
});
it("processes an unsubscribe token using the bound client", async () => {
  const token = "b".repeat(64);
  window.history.replaceState({}, "", `/outreach-unsubscribe?token=${token}`);
  render(<OutreachUnsubscribe />);
  await screen.findByText(/You won't receive further Rocket/);
  expect(mocks.requests).toEqual([
    { name: "rocket_unsubscribe_founder_outreach", args: { p_token: token } },
  ]);
});
