import { fireEvent, render, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  NotificationsProvider,
  useNotifications,
  legacyNotifications,
  safeNotificationHref,
} from "./NotificationsContext";
const mocks = vi.hoisted(() => ({
  user: { id: "alice" } as { id: string } | null,
  load: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ key: "/" }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        const q = {
          eq: (...args: any[]) => {
            mocks.eq(...args);
            return q;
          },
          is: () => q,
          order: () => q,
          limit: () => mocks.load(),
        };
        return q;
      },
      insert: (values: any) => mocks.insert(values),
      update: (values: any) => {
        mocks.update(values);
        const q = { eq: () => q, in: async () => ({ error: null }), is: async () => ({ error: null }) };
        return q;
      },
    }),
  },
}));
function Inbox() {
  const n = useNotifications();
  return (
    <>
      <div data-testid="items">{JSON.stringify(n.items)}</div>
      <div data-testid="count">{n.unread}</div>
      {n.error && <p role="alert">{n.error}</p>}
      <button onClick={n.markAllRead}>Read</button>
      <button onClick={n.clearAll}>Clear</button>
      <button
        onClick={() =>
          n.add({ kind: "asset", title: "Logo saved", href: "/designs" })
        }
      >
        Add
      </button>
    </>
  );
}
const fixture = () => (
  <NotificationsProvider>
    <Inbox />
  </NotificationsProvider>
);
const row = {
  id: "real-id",
  kind: "app",
  title: "App published",
  href: "/apps/example",
  created_at: "2026-10-03T10:00:00Z",
  read_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string,string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string,v: string) => storage.set(k,v), clear: () => storage.clear() });
  localStorage.clear();
  mocks.user = { id: "alice" };
  mocks.load.mockResolvedValue({ data: [row], error: null });
  mocks.insert.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("account notifications", () => {
  it("loads real app notifications and filters by account", async () => {
    const ui = render(fixture());
    await waitFor(() => expect(ui.getByTestId("count").textContent).toBe("1"));
    expect(ui.getByTestId("items").textContent).toContain("App published");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "alice");
  });
  it("persists read and dismiss state", async () => {
    const ui = render(fixture());
    await waitFor(() => expect(ui.getByTestId("count").textContent).toBe("1"));
    fireEvent.click(ui.getByText("Read"));
    expect(ui.getByTestId("count").textContent).toBe("0");
    expect(mocks.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
    fireEvent.click(ui.getByText("Clear"));
    expect(ui.getByTestId("items").textContent).toBe("[]");
    expect(mocks.update).toHaveBeenCalledWith({
      dismissed_at: expect.any(String),
    });
  });
  it("does not display the previous account or let its late request win", async () => {
    let resolve: any;
    mocks.load.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const ui = render(fixture());
    await waitFor(() => expect(mocks.load).toHaveBeenCalled());
    mocks.user = { id: "bob" };
    mocks.load.mockResolvedValue({ data: [], error: null });
    ui.rerender(fixture());
    await waitFor(() =>
      expect(mocks.eq).toHaveBeenCalledWith("user_id", "bob"),
    );
    resolve({ data: [row], error: null });
    await waitFor(() => expect(ui.getByTestId("items").textContent).toBe("[]"));
  });
  it("does not seed notifications or query while signed out", () => {
    mocks.user = null;
    const ui = render(fixture());
    expect(ui.getByTestId("items").textContent).toBe("[]");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("retains genuine local Create notifications but drops fabricated seeds", () => {
    localStorage.setItem(
      "rocket.notifications.v1.alice",
      JSON.stringify([
        { id: "n1", kind: "system", title: "Welcome" },
        { id: "n2", kind: "asset", title: "Fake logo" },
        { id: "n3", kind: "billing", title: "Fake credits" },
        { id: "n_123", kind: "asset", title: "Real design", href: "/designs" },
      ]),
    );
    expect(legacyNotifications("alice").map((n) => n.title)).toEqual([
      "Real design",
    ]);
  });
  it("saves Create events to the durable inbox", async () => {
    const ui = render(fixture());
    fireEvent.click(ui.getByText("Add"));
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "alice",
          kind: "asset",
          title: "Logo saved",
        }),
      ),
    );
  });
  it("reports fetch failures instead of claiming an empty inbox is caught up", async () => {
    mocks.load.mockResolvedValue({ error: new Error("unavailable") });
    const ui = render(fixture());
    await waitFor(() =>
      expect(ui.getByRole("alert").textContent).toContain("couldn't be loaded"),
    );
  });
  it("only permits safe internal notification links", () => {
    expect(safeNotificationHref("/settings/developer")).toBe(
      "/settings/developer",
    );
    for (const href of [
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "/x\n",
    ])
      expect(safeNotificationHref(href)).toBeUndefined();
  });
});
