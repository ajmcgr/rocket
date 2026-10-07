import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SaveAppButton from "./SaveAppButton";

const mocks = vi.hoisted(() => ({ user: { id: "user-1" } as { id: string } | null, navigate: vi.fn(), insert: vi.fn(), remove: vi.fn(), eq: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({
  insert: mocks.insert,
  delete: () => { const q = { eq: (...args: unknown[]) => { mocks.eq(...args); return q; }, then: (resolve: (value: unknown) => void) => mocks.remove().then(resolve) }; return q; },
}) } }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { id: "user-1" };
  mocks.insert.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("bookmark saving", () => {
  it("uses a smaller desktop control in list rows while keeping mobile touch targets", () => {
    render(<SaveAppButton appId="app-1" saved={false} onChange={vi.fn()} compact />);
    const button = screen.getByRole("button", { name: "Save app" });
    expect(button.className).toContain("sm:h-9 sm:w-9");
    expect(button.className).toContain("h-11 w-11");
    expect(button.querySelector("svg")?.getAttribute("class")).toContain("h-4 w-4");
  });
  it("has no visible Save text, an accessible label, and an outlined bookmark", () => {
    render(<SaveAppButton appId="app-1" saved={false} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Save app" });
    expect(button.textContent).toBe("");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.querySelector("svg")?.getAttribute("fill")).toBe("none");
    expect(button.className).toContain("h-11 w-11");
  });
  it("saves once and does not bubble to an app link", async () => {
    const change = vi.fn(), parent = vi.fn();
    render(<div onClick={parent}><SaveAppButton appId="app-1" saved={false} onChange={change} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(true));
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "user-1", app_id: "app-1" });
    expect(parent).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("fills saved bookmarks and removes only the current user's app", async () => {
    const change = vi.fn();
    render(<SaveAppButton appId="app-1" saved onChange={change} />);
    const button = screen.getByRole("button", { name: "Unsave app" });
    expect(screen.getByRole('button', { name: 'Add app to collections' })).toBeTruthy();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
    fireEvent.click(button);
    await waitFor(() => expect(change).toHaveBeenCalledWith(false));
    expect(mocks.eq.mock.calls).toEqual([["user_id", "user-1"], ["app_id", "app-1"]]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("takes signed-out users to login without writing a save", () => {
    mocks.user = null;
    render(<SaveAppButton appId="app-1" saved={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save app" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/login?next=%2Fapps%2Fapp-1%3Fsave%3D1");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("keeps the bookmark unsaved and permits retry after a failed request", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("offline"));
    const change = vi.fn();
    render(<SaveAppButton appId="app-1" saved={false} onChange={change} />);
    const button = screen.getByRole("button", { name: "Save app" });
    fireEvent.click(button);
    await waitFor(() => expect(button.title).toContain("Could not update"));
    expect(change).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(change).toHaveBeenCalledWith(true));
  });
});
