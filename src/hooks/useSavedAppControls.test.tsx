import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSavedAppControls } from "./useSavedAppControls";
const mocks = vi.hoisted(() => ({ user: { id: "alice" } as { id: string } | null, load: vi.fn(), eq: vi.fn(), ids: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({
  eq: (...args: unknown[]) => { mocks.eq(...args); return { in: (...ids: unknown[]) => { mocks.ids(...ids); return mocks.load(); } }; },
}) }) } }));
function Collection() {
  const controls = useSavedAppControls(["app-2", "app-1", "app-1"]);
  const first = controls("app-1");
  return <button aria-pressed={first.saved} onClick={() => first.onSave(!first.saved)}>Bookmark</button>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: "alice" }; mocks.load.mockResolvedValue({ data: [{ app_id: "app-1" }], error: null }); });
afterEach(cleanup);
it("batches unique app IDs and shares updated saved state across renders", async () => {
  const view = render(<Collection />);
  await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true"));
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "alice");
  expect(mocks.ids).toHaveBeenCalledWith("app_id", ["app-1", "app-2"]);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  view.rerender(<Collection />);
  expect(mocks.load).toHaveBeenCalledTimes(1);
});
it("does not load saves for signed-out visitors", () => {
  mocks.user = null;
  render(<Collection />);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("never shows the previous account's saved state after switching users", async () => {
  const view = render(<Collection />);
  await waitFor(() => expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true"));
  mocks.user = { id: "bob" };
  mocks.load.mockReturnValue(new Promise(() => {}));
  view.rerender(<Collection />);
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  expect(mocks.eq).toHaveBeenLastCalledWith("user_id", "bob");
});
