import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  apps: vi.fn(),
  eq: vi.fn(),
  user: { id: "A" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: m.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
vi.mock("@/lib/collections", () => ({
  collectionApps: m.apps,
  COLLECTION_PAGE_SIZE: 24,
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  collectionPath: (c: any, personal: boolean) =>
    c.id
      ? `${personal ? "/my-collections" : "/collections"}/${c.slug}`
      : "/saved-apps",
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("./CollectionPicker", () => ({
  CollectionMemberships: ({ appId }: any) => <p>Organizing {appId}</p>,
}));
import CollectionCard from "./CollectionCard";
import CollectionOptions from "./CollectionOptions";
const saved = {
  name: "Saved",
  slug: "saved",
  app_count: 2,
  logos: [],
  updated_at: null,
};
const custom = {
  ...saved,
  id: "c1",
  name: "Tools",
  slug: "tools",
  visibility: "private" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.apps.mockResolvedValue([
    { id: "app1", name: "One" },
    { id: "app2", name: "Two" },
  ]);
  m.from.mockImplementation((table: string) => {
    const q: any = {
      select: () => q,
      eq: (...args: any[]) => {
        m.eq(...args);
        return q;
      },
      order: () => q,
      range: async () => ({
        data: [{ app_id: "app1" }, { app_id: "app2" }],
        error: null,
      }),
      in: async () => ({
        data: [
          { id: "app1", name: "One" },
          { id: "app2", name: "Two" },
        ],
        error: null,
      }),
    };
    return q;
  });
});
afterEach(cleanup);
it("keeps personal three-dot controls outside the collection link and hides them on public cards", () => {
  const view = render(<CollectionCard collection={custom} personal />);
  const button = screen.getByRole("button", {
    name: "Collection options for Tools",
  });
  expect(button.closest("a")).toBeNull();
  expect(button.querySelector("svg")?.getAttribute("class")).toContain(
    "lucide-ellipsis",
  );
  view.rerender(<CollectionCard collection={custom} />);
  expect(
    screen.queryByRole("button", { name: "Collection options for Tools" }),
  ).toBeNull();
  expect(m.apps).not.toHaveBeenCalled();
});
it("loads Saved lazily for the signed-in user and switches the membership editor with the chosen app", async () => {
  render(<CollectionOptions collection={saved} />);
  expect(m.from).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Collection options for Saved" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "One" }));
  await screen.findByText("Organizing app1");
  expect(m.eq).toHaveBeenCalledWith("user_id", "A");
  expect(screen.getByRole("dialog").className).toContain(
    "gentle-dialog-content",
  );
  fireEvent.click(screen.getByRole("button", { name: "All apps" }));
  fireEvent.click(screen.getByRole("button", { name: "Two" }));
  expect(screen.getByText("Organizing app2")).toBeTruthy();
  expect(screen.queryByText("Organizing app1")).toBeNull();
  expect(
    screen.queryByRole("link", {
      name: "Rename or change collection settings",
    }),
  ).toBeNull();
});
it("edits custom settings and organizes apps in the same dialog and refreshes on close", async () => {
  const updated = vi.fn();
  render(<CollectionOptions collection={custom} onUpdated={updated} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Collection options for Tools" }),
  );
  expect(screen.getByLabelText("Collection name")).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Organize apps" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("button", { name: "One" }));
  await screen.findByText("Organizing app1");
  expect(m.apps).toHaveBeenCalledWith("c1", 0);
  expect(
    screen.queryByRole("link", {
      name: "Rename or change collection settings",
    }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
});
it("does not show an app editor when the collection read is denied", async () => {
  m.apps.mockRejectedValue(new Error("denied"));
  render(<CollectionOptions collection={custom} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Collection options for Tools" }),
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Organize apps" }), {
    button: 0,
    ctrlKey: false,
  });
  expect((await screen.findByRole("alert")).textContent).toContain(
    "could not be loaded",
  );
  expect(screen.queryByRole("combobox")).toBeNull();
});
