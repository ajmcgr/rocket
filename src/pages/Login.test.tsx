import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const mocks = vi.hoisted(() => ({
  nav: vi.fn(), toast: vi.fn(), password: vi.fn(), signup: vi.fn(), oauth: vi.fn(),
  invoke: vi.fn(), profile: vi.fn(),
}));
vi.mock("@/components/SiteHeader", () => ({ default: () => null }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/router-compat", () => ({
  useNavigate: () => mocks.nav,
  useLocation: () => ({ search: "?next=%2Fconnect%2Fauthorize%3Fclient_id%3Dexample" }),
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { signInWithPassword: mocks.password, signUp: mocks.signup, signInWithOAuth: mocks.oauth },
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
} }));

let root: Root;
let container: HTMLDivElement;
const buttons = () => Array.from(container.querySelectorAll("button"));
const clickRocket = () => act(async () => { buttons()[0].click(); });
async function render(mode: "login" | "signup" = "login") {
  await act(async () => { root.render(<Login mode={mode} />); });
}
async function fillAndSubmit() {
  await act(async () => {
    fireEvent.change(container.querySelector('[aria-label="Email"]')!, { target: { value: "buyer@example.com" } });
    fireEvent.change(container.querySelector('[aria-label="Password"]')!, { target: { value: "secure-password" } });
  });
  await act(async () => { fireEvent.submit(container.querySelector("form")!); });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { github: true } }) }));
  mocks.invoke.mockResolvedValue({ data: {}, error: null });
  mocks.oauth.mockResolvedValue({ error: null });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("Rocket's own account entry", () => {
  it.each(["login", "signup"] as const)("puts Rocket first in %s and focuses email without starting OAuth", async (mode) => {
    await render(mode);
    expect(buttons().slice(0, 4).map(button => button.textContent)).toEqual([
      "Continue with Rocket", "Continue with Google", "Continue with X", "Continue with GitHub",
    ]);
    expect(container.querySelector("form")!.hidden).toBe(false);
    expect(container.querySelector("form")!.hasAttribute("hidden")).toBe(false);
    await clickRocket();
    expect(container.querySelector("form")!.hidden).toBe(false);
    expect(buttons()[0].hasAttribute("aria-expanded")).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('[aria-label="Email"]'));
    expect(mocks.oauth).not.toHaveBeenCalled(); expect(mocks.password).not.toHaveBeenCalled();
  });
  it("uses existing verified email login and preserves the safe return path", async () => {
    mocks.password.mockResolvedValue({ data: { user: { id: "buyer", email_confirmed_at: "2026-10-07", app_metadata: { provider: "email" } } }, error: null });
    await render(); await fillAndSubmit();
    expect(mocks.password).toHaveBeenCalledWith({ email: "buyer@example.com", password: "secure-password" });
    expect(mocks.nav).toHaveBeenCalledWith("/connect/authorize?client_id=example", { replace: true });
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
  it("preserves verification for unconfirmed accounts", async () => {
    mocks.password.mockResolvedValue({ data: { user: { id: "buyer", app_metadata: { provider: "email" } } }, error: null });
    mocks.profile.mockResolvedValue({ data: { email_verified: false } });
    await render(); await clickRocket(); await fillAndSubmit();
    expect(mocks.invoke).toHaveBeenCalledWith("send-verification", { body: { next: "/connect/authorize?client_id=example" } });
    expect(mocks.nav.mock.calls[0][0]).toContain("/verify-email?email=buyer%40example.com");
  });
  it("preserves signup and third-party login", async () => {
    mocks.signup.mockResolvedValue({ data: { session: {} }, error: null });
    await render("signup"); await clickRocket();
    await act(async () => { fireEvent.change(container.querySelector('[aria-label="Username"]')!, { target: { value: "buyer" } }); });
    await fillAndSubmit();
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({ email: "buyer@example.com", options: { data: { username: "buyer", ref: undefined } } }));
    await act(async () => { buttons()[1].click(); });
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fconnect%2Fauthorize%3Fclient_id%3Dexample` } });
  });
  it("shows password errors without redirecting", async () => {
    mocks.password.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    await render(); await clickRocket(); await fillAndSubmit();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Invalid login credentials" }));
    expect(mocks.nav).not.toHaveBeenCalled();
  });
});
