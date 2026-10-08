import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/collections", () => ({
  updateCollection: m.update,
  deleteCollection: m.remove,
  createCollection: m.create,
}));
import CollectionSettings from "./CollectionSettings";
import NewCollectionButton from "./NewCollectionButton";
const collection = {
  id: "c1",
  name: "AI tools",
  slug: "ai-tools",
  visibility: "private" as const,
  app_count: 1,
  logos: [],
  updated_at: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockResolvedValue(undefined);
  m.remove.mockResolvedValue(undefined);
  m.create.mockResolvedValue({ ...collection, id: "c2" });
});
afterEach(cleanup);
it("renames via the existing owned collection update without altering membership", async () => {
  const done = vi.fn();
  render(
    <CollectionSettings
      collection={collection}
      onSaved={done}
      onDeleted={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Collection name"), {
    target: { value: "Useful AI" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(m.update).toHaveBeenCalledWith("c1", {
    name: "Useful AI",
    visibility: "private",
  });
  expect(m.remove).not.toHaveBeenCalled();
});
it("requires an explicit second action to publish and allows cancelling", async () => {
  render(
    <CollectionSettings
      collection={collection}
      onSaved={vi.fn()}
      onDeleted={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(m.update).not.toHaveBeenCalled();
  expect(screen.getByText("Make this collection public?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(m.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  fireEvent.click(screen.getByRole("button", { name: "Make public" }));
  await waitFor(() =>
    expect(m.update).toHaveBeenCalledWith("c1", {
      name: "AI tools",
      visibility: "public",
    }),
  );
});
it("requires delete confirmation, reports failure and leaves the collection intact", async () => {
  m.remove.mockRejectedValue(new Error("denied"));
  const deleted = vi.fn();
  render(
    <CollectionSettings
      collection={collection}
      onSaved={vi.fn()}
      onDeleted={deleted}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(m.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete collection" }));
  await screen.findByRole("alert");
  expect(deleted).not.toHaveBeenCalled();
  expect(m.remove).toHaveBeenCalledWith("c1");
  expect(
    screen
      .getByRole("button", { name: "Delete collection" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
it("creates through a focused dialog with a private default and dismisses on success", async () => {
  const done = vi.fn();
  render(<NewCollectionButton onCreated={done} />);
  fireEvent.click(screen.getByRole("button", { name: "New collection" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    (screen.getByRole("radio", { name: "Private" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Collection name"), {
    target: { value: "AI tools" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(m.create).toHaveBeenCalledWith("AI tools", "private");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
