import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
function MemoryRouter({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
import MarketplaceFollow from "./MarketplaceFollow";
import MarketplaceFollowSettings from "./MarketplaceFollowSettings";
const m = vi.hoisted(() => ({
  user: { id: "buyer" } as { id: string } | null,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: m.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: m.rpc, from: m.from },
}));
function table(data: unknown) {
  const q: any = {
    then: (f: any) => Promise.resolve({ data, error: null }).then(f),
    maybeSingle: async () => ({ data, error: null }),
  };
  for (const k of ["select", "eq", "order"]) q[k] = () => q;
  return q;
}
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  m.user = { id: "buyer" };
  m.rpc.mockReset();
  m.rpc.mockResolvedValue({ data: null, error: null });
  m.from.mockReturnValue(table(null));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Marketplace follow consent", () => {
  it("does not subscribe automatically; requires an explicit click and can unsubscribe", async () => {
    render(
      <MemoryRouter>
        <MarketplaceFollow target="app:app" label="app" />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: "Follow app" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    expect(m.rpc).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByRole("button", { name: "Unfollow app" });
    expect(m.rpc).toHaveBeenCalledWith("set_marketplace_follow", {
      p_target: "app:app",
      p_follow: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Unfollow app" }));
    await screen.findByRole("button", { name: "Follow app" });
    expect(m.rpc).toHaveBeenLastCalledWith("set_marketplace_follow", {
      p_target: "app:app",
      p_follow: false,
    });
  });
  it("does not reveal a previous user preference after an account switch", async () => {
    m.from.mockReturnValue(table({ target: "app:app" }));
    const ui = render(
      <MemoryRouter>
        <MarketplaceFollow target="app:app" label="app" />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Unfollow app" });
    m.user = null;
    ui.rerender(
      <MemoryRouter>
        <MarketplaceFollow target="app:app" label="app" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Unfollow app" })).toBeNull();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("offers unsubscribe from the existing notifications screen", async () => {
    m.from.mockReturnValue(table([{ target: "developer:builder" }]));
    render(
      <MemoryRouter>
        <MarketplaceFollowSettings />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: "Unfollow" });
    fireEvent.click(button);
    await screen.findByText("You aren’t following any apps or developers.");
    expect(m.rpc).toHaveBeenCalledWith("set_marketplace_follow", {
      p_target: "developer:builder",
      p_follow: false,
    });
  });
});
