import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Notifications from "./Notifications";

const mocks = vi.hoisted(() => ({
  state: { items: [] as any[], unread: 0, loading: false, error: null as string | null,
    refresh: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), remove: vi.fn(), clearAll: vi.fn() },
}));
vi.mock("@/contexts/NotificationsContext", () => ({ useNotifications: () => mocks.state }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));
beforeEach(() => { vi.clearAllMocks(); Object.assign(mocks.state, { items: [], unread: 0, loading: false, error: null }); });
afterEach(cleanup);

describe("notifications page", () => {
  it("does not claim the user is caught up when loading failed", () => {
    mocks.state.error = "Notifications couldn't be loaded. Please try again.";
    const ui = render(<Notifications />);
    expect(ui.queryByText("You're all caught up.")).toBeNull();
    expect(ui.getByText("Inbox unavailable")).toBeTruthy();
    fireEvent.click(ui.getByText("Retry"));
    expect(mocks.state.refresh).toHaveBeenCalledOnce();
  });
  it("does not claim the user is caught up while loading", () => {
    mocks.state.loading = true;
    const ui = render(<Notifications />);
    expect(ui.getByText("Loading notifications…")).toBeTruthy();
    expect(ui.queryByText("You're all caught up.")).toBeNull();
  });
  it("dismisses a notification independently without nested interactive controls", () => {
    mocks.state.items = [{ id: "example", kind: "asset", title: "Logo saved", createdAt: Date.now(), read: false }];
    mocks.state.unread = 1;
    const ui = render(<Notifications />);
    expect(ui.container.querySelector("button button, a button")).toBeNull();
    fireEvent.click(ui.getByLabelText("Dismiss Logo saved"));
    expect(mocks.state.remove).toHaveBeenCalledWith("example");
    expect(mocks.state.markRead).not.toHaveBeenCalled();
  });
});
