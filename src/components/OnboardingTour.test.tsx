import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: null as any,
  loading: false,
  apps: vi.fn(),
  invoke: vi.fn(),
  track: vi.fn(),
  nav: vi.fn(),
  location: { pathname: "/discover", search: "", hash: "" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mock.user, loading: mock.loading }),
}));
vi.mock("@/lib/router-compat", () => ({
  useLocation: () => mock.location,
  useNavigate: () => mock.nav,
}));
vi.mock("@/lib/myApps", () => ({ loadMyApps: mock.apps }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke } },
}));
vi.mock("@/lib/analytics", () => ({ track: mock.track }));
import OnboardingTour from "./OnboardingTour";
const key = "rocket.onboarding.v2.new-user";
const owned = {
  owned: true,
  app_id: "owned-app",
  owner_verification_level: "domain_verified",
  app: { name: "My private app" },
};
const advance = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
  await act(async () => {});
};
const start = async (items: any[] = []) => {
  mock.apps.mockResolvedValue(items);
  const view = render(<OnboardingTour />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(601);
  });
  return view;
};
const choose = async (label = "I've already built an app") => {
  fireEvent.click(screen.getByRole("button", { name: /Get started/ }));
  fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
  await advance();
};
beforeEach(() => {
  vi.useFakeTimers();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
  });
  sessionStorage.clear();
  vi.clearAllMocks();
  mock.user = { id: "new-user", created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
  mock.loading = false;
  mock.location = { pathname: "/discover", search: "", hash: "" };
  mock.apps.mockResolvedValue([]);
  mock.invoke.mockResolvedValue({
    data: null,
    error: new Error("Unavailable"),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("existing onboarding personalized journeys", () => {
  it("starts the existing tour and requires only a temporary intent selection", async () => {
    await start();
    expect(screen.getByText("Welcome to Rocket.")).toBeTruthy();
    expect(
      screen.getByText("Discover apps. Grow and monetize yours."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Get started/ }));
    expect(
      screen.getByRole("button", { name: /Continue/ }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "I'm building an app" }),
    );
    expect(mock.track).toHaveBeenCalledWith("onboarding_intent_selected", {
      intent: "building",
    });
    expect(localStorage.getItem(key)).toBeNull();
    expect(mock.track).not.toHaveBeenCalledWith(
      "onboarding_completed",
      expect.anything(),
    );
  });
  it.each(["Add a new app", "Claim an existing app", "Manage my apps"])(
    "uses the existing journey destination for %s without granting ownership",
    async (label) => {
      await start();
      await choose();
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(mock.nav).toHaveBeenCalledWith(
        label === "Add a new app"
          ? "/submit"
          : label === "Claim an existing app"
            ? "/discover"
            : "/your-apps",
      );
      expect(mock.track).toHaveBeenCalledWith(
        "onboarding_skipped",
        expect.objectContaining({ reason: "primary_cta" }),
      );
      expect(mock.track).not.toHaveBeenCalledWith(
        "claim_verified",
        expect.anything(),
      );
      expect(localStorage.getItem(key)).toBe("1");
    },
  );
  it("lets a developer without apps finish, skip profile and learn verification without dead-end links", async () => {
    await start();
    await choose("I'm building an app");
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(
      screen.getByRole("button", { name: "Complete profile" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByText(/Metrics are private by default/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /verification settings/ }),
    ).toBeNull();
    expect(mock.invoke).not.toHaveBeenCalled();
    await advance();
    expect(
      screen.getByText(/membership alone does not activate checkout/),
    ).toBeTruthy();
    await advance();
    fireEvent.click(screen.getByRole("button", { name: /Add my app/ }));
    expect(mock.nav).toHaveBeenCalledWith("/submit");
    expect(mock.track).toHaveBeenCalledWith(
      "onboarding_completed",
      expect.objectContaining({ intent: "building" }),
    );
  });
  it("personalizes explorer education and completion without requiring an app", async () => {
    await start([owned]);
    await choose("I'm exploring apps");
    expect(screen.getByText("Find your next app.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Claim an existing app" }),
    ).toBeNull();
    await advance();
    await advance();
    expect(
      screen.queryByRole("button", { name: /verification settings/ }),
    ).toBeNull();
    expect(mock.invoke).not.toHaveBeenCalled();
    await advance();
    await advance();
    fireEvent.click(screen.getByRole("button", { name: /Explore apps/ }));
    expect(mock.nav).toHaveBeenCalledWith("/discover");
  });
  it("offers owner-only settings and only available production revenue providers", async () => {
    mock.invoke.mockImplementation(async (endpoint: string) => ({
      data: { connect_available: endpoint === "rocket-revenuecat" },
      error: null,
    }));
    await start([owned, { ...owned, app_id: "pending", owned: false }]);
    await choose();
    await advance();
    await advance();
    expect(screen.getByText(/RevenueCat/)).toBeTruthy();
    expect(screen.queryByText("Polar")).toBeNull();
    expect(
      screen.getByText(/Stripe Revenue Verification/).textContent,
    ).toContain("Available for domain-verified app owners");
    expect(
      mock.invoke.mock.calls.every(
        ([, args]) => args.body.app_id === "owned-app",
      ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Traffic verification settings" }),
    );
    expect(mock.nav).toHaveBeenCalledWith("/my-apps/owned-app/analytics");
    expect(mock.track).not.toHaveBeenCalledWith(
      "analytics_connected",
      expect.anything(),
    );
  });
  it("routes claimed owners to management but does not treat unverified ownership as provider eligibility", async () => {
    await start([{ ...owned, owner_verification_level: "claimed" }]);
    await choose();
    await advance();
    await advance();
    expect(
      screen.queryByRole("button", { name: /verification settings/ }),
    ).toBeNull();
    await advance();
    await advance();
    fireEvent.click(screen.getByRole("button", { name: /Manage my app/ }));
    expect(mock.nav).toHaveBeenCalledWith("/my-apps/owned-app");
  });
  it("preserves skipped completion on remount", async () => {
    const view = await start();
    fireEvent.click(screen.getByRole("button", { name: "Skip onboarding" }));
    expect(mock.track).toHaveBeenCalledWith(
      "onboarding_skipped",
      expect.anything(),
    );
    expect(mock.track).not.toHaveBeenCalledWith(
      "onboarding_completed",
      expect.anything(),
    );
    view.unmount();
    await start();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not reopen for completed or returning members, but supports an explicit guide replay", async () => {
    mock.location.search="?welcome=1";
    localStorage.setItem(key, "1");
    await start();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      window.dispatchEvent(new Event("rocket:start-tour"));
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(localStorage.getItem(key)).toBe("1");
  });
  it("silently preserves the existing older-account behavior", async () => {
    mock.user.created_at = "2020-01-01";
    await start();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(key)).toBe("1");
    expect(mock.track).not.toHaveBeenCalled();
  });
  it.each([
    ["/auth/callback", "?code=secret&next=%2Fclaim-invitation"],
    ["/claim-invitation", "?token=secret"],
    ["/apps/add", "?app=existing"],
    ["/my-apps/owned-app/analytics", "?ga4=connected"],
    ["/discover", "?next=%2Fclaim-invitation%3Ftoken%3Dsecret"],
    ["/your-apps", "?session_id=secret&success=true"],
    ["/connect/authorize", "?client_id=app"],
  ])(
    "does not interrupt protected destinations %s %s",
    async (pathname, search) => {
      mock.location = { pathname, search, hash: "" };
      await start();
      await act(async () => {
        window.dispatchEvent(new Event("rocket:start-tour"));
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(mock.nav).not.toHaveBeenCalled();
      expect(localStorage.getItem(key)).toBeNull();
      expect(mock.apps).not.toHaveBeenCalled();
    },
  );
  it("preserves a pending claim invitation even on a safe landing page", async () => {
    sessionStorage.setItem(
      "rocket:founder-claim-invitation",
      "pending-private-invitation",
    );
    await start();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sessionStorage.getItem("rocket:founder-claim-invitation")).toBe(
      "pending-private-invitation",
    );
    expect(mock.nav).not.toHaveBeenCalled();
    expect(mock.track).not.toHaveBeenCalled();
  });
  it("reuses the existing profile help surface without clearing completion", async () => {
    localStorage.setItem(key, "1");
    mock.location = {
      pathname: "/settings/profile",
      search: "",
      hash: "onboarding",
    };
    await start();
    expect(screen.getByText("Welcome to Rocket.")).toBeTruthy();
    expect(mock.nav).toHaveBeenCalledWith("/settings/profile", {
      replace: true,
    });
    expect(localStorage.getItem(key)).toBe("1");
  });
  it("never shows another account’s app names after an account change", async () => {
    const view = await start([owned]);
    await choose();
    await advance();
    await advance();
    mock.user = { id: "other", created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() };
    mock.apps.mockResolvedValue([]);
    view.rerender(<OnboardingTour />);
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("My private app")).toBeNull();
  });
  it("stays closed for unauthenticated or still-loading sessions", async () => {
    mock.user = null;
    await start();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mock.apps).not.toHaveBeenCalled();
  });
  it("waits for verified email, then automatically opens on the verification welcome landing",async()=>{
    mock.user.email_confirmed_at=null;mock.location.search="?welcome=1&utm_content=launch-post";
    const view=await start();expect(screen.queryByRole("dialog")).toBeNull();expect(localStorage.getItem(key)).toBeNull();
    mock.user={...mock.user,email_confirmed_at:new Date().toISOString()};view.rerender(<OnboardingTour/>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(601)});
    expect(screen.getByText("Welcome to Rocket.")).toBeTruthy();
  });

});
