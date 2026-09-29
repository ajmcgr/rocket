import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const renderCallback = async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={["/auth/callback"]}><Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/discover" element={<p>Discover reached</p>} />
    </Routes></MemoryRouter>);
  });
  return { container, cleanup: async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  } };
};

describe("OAuth callback", () => {
  beforeEach(() => {
    auth.getSession.mockReset();
    auth.exchangeCodeForSession.mockReset();
    window.history.replaceState({}, "", "/auth/callback?code=valid-code&next=%2Fdiscover");
  });

  it("exchanges only the authorization code when there is no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    const { container, cleanup } = await renderCallback();
    try {
      expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("valid-code");
      expect(container.textContent).toContain("Discover reached");
    } finally { await cleanup(); }
  });

  it("does not exchange an already-consumed code after automatic session recovery", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "test" } } });
    const { container, cleanup } = await renderCallback();
    try {
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Discover reached");
    } finally { await cleanup(); }
  });
});
