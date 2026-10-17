import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/test/MemoryRouter";
import { useLocation } from "@/lib/router-compat";
import ProtectedRoute from "@/components/ProtectedRoute";
import AddApp from "./AddApp";
import { track } from "@/lib/analytics";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  user: { id: "claimant", app_metadata: { provider: "google" } } as
    object | null,
  claimState: "unclaimed",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/components/RocketShare", () => ({ default: () => null }));
const appId = "00000000-0000-4000-8000-000000000001";
const challenge = {
  status: "pending",
  challenge_id: "challenge",
  method: "dns_txt",
  host: "_rocket-verify.example.com",
  value: "rocket-verification=secret",
  token: "secret",
  expires_at: "2099-01-01T00:00:00Z",
};
function LoginDestination() {
  const location = useLocation();
  return <p>Login destination: {location.search}</p>;
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={[`/apps/add?app=${appId}`]}>
      <Routes>
        <Route
          path="/apps/add"
          element={
            <ProtectedRoute>
              <AddApp />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  );

describe("existing app ownership flow", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.user = { id: "claimant", app_metadata: { provider: "google" } };
    mocks.claimState = "unclaimed";
    vi.clearAllMocks();
    mocks.invoke.mockReset();
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: appId,
              name: "Existing app",
              website_url: "https://example.com",
              claim_state: mocks.claimState,
            },
          }),
        }),
      }),
    }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(["verified", "needs_review", "error"])(
    "emits claim_verified only after a verified server result (%s)",
    async (outcome) => {
      mocks.invoke
        .mockResolvedValueOnce({ data: challenge, error: null })
        .mockResolvedValueOnce(
          outcome === "error"
            ? {
                data: { error: "The required DNS TXT record was not found" },
                error: null,
              }
            : { data: { outcome }, error: null },
        );
      mount();
      fireEvent.click(
        await screen.findByRole("button", { name: "Verify domain (DNS)" }),
      );
      await screen.findByText("Add this TXT record to your domain");
      expect(track).toHaveBeenCalledWith("claim_started", {
        app_id: appId,
        method: "dns_txt",
      });
      expect(track).not.toHaveBeenCalledWith(
        "claim_verified",
        expect.anything(),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Verify", exact: true }),
      );
      if (outcome === "verified") {
        await screen.findByText("Domain verified. This app is now in My Apps.");
        expect(track).toHaveBeenCalledWith("claim_verified", {
          app_id: appId,
          method: "dns_txt",
        });
      } else {
        await screen.findByRole("alert");
        expect(track).not.toHaveBeenCalledWith(
          "claim_verified",
          expect.anything(),
        );
      }
      expect(
        mocks.invoke.mock.calls.map(([, options]) => options.body),
      ).toEqual([
        {
          action: "claim",
          app_id: appId,
          method: "dns_txt",
          evidence: undefined,
        },
        { action: "verify", challenge_id: "challenge", token: "secret" },
      ]);
      expect(
        vi.mocked(track).mock.calls.every(([, props]) => !props?.token),
      ).toBe(true);
    },
  );

  it("does not offer automatic verification for an already verified listing", async () => {
    mocks.claimState = "domain_verified";
    mount();
    await screen.findByText("Already claimed");
    expect(
      screen.queryByRole("button", { name: "Verify domain (DNS)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use website file" }),
    ).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("honors an owner conflict returned after viewing a stale unclaimed listing", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        status: "review",
        reason:
          "This app has already been claimed. Ownership review is required.",
      },
      error: null,
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Verify domain (DNS)" }),
    );
    await screen.findByText(
      "This app has already been claimed. Ownership review is required.",
    );
    expect(
      screen.queryByRole("button", { name: "Verify", exact: true }),
    ).toBeNull();
    expect(track).not.toHaveBeenCalledWith("claim_verified", expect.anything());
  });

  it("sends signed-out claimants to login with the exact app destination", async () => {
    mocks.user = null;
    mount();
    await waitFor(() =>
      expect(screen.getByText(/Login destination:/).textContent).toContain(
        `?next=${encodeURIComponent(`/apps/add?app=${appId}`)}`,
      ),
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
