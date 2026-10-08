import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  myCollections: vi.fn(),
  membership: vi.fn(),
  create: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/collections", () => ({
  myCollections: m.myCollections,
  setCollectionMembership: m.membership,
  createCollection: m.create,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
import CollectionPicker from "./CollectionPicker";
import { useState } from "react";
function PickerFixture({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <CollectionPicker
      appId={appId}
      open={open}
      onOpenChange={setOpen}
      trigger={<button>Add app to collections</button>}
      saved
      onSavedChange={vi.fn()}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.myCollections.mockResolvedValue([
    { name: "Saved", slug: "saved" },
    { id: "c1", name: "AI tools", visibility: "private" },
  ]);
  const q = {
    select: () => q,
    eq: () => q,
    in: () => Promise.resolve({ data: [], error: null }),
  };
  m.from.mockReturnValue(q);
  m.membership.mockResolvedValue(undefined);
  m.create.mockResolvedValue({
    id: "c2",
    name: "New shortlist",
    visibility: "private",
  });
});
afterEach(cleanup);
it("loads only when opened, stops card clicks, and supports independent membership", async () => {
  const parent = vi.fn();
  render(
    <div onClick={parent}>
      <PickerFixture appId="app1" />
    </div>,
  );
  expect(m.myCollections).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Add app to collections" }),
  );
  expect(parent).not.toHaveBeenCalled();
  const checkbox = await screen.findByRole("checkbox", { name: /AI tools/ });
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(m.membership).toHaveBeenCalledWith("c1", "app1", true),
  );
  await waitFor(() =>
    expect((checkbox as HTMLInputElement).checked).toBe(true),
  );
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(m.membership).toHaveBeenCalledWith("c1", "app1", false),
  );
});
it("creates private by default and never grants public visibility implicitly", async () => {
  render(<PickerFixture appId="app1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Add app to collections" }),
  );
  await screen.findByRole("checkbox", { name: /AI tools/ });
  fireEvent.click(screen.getByRole("button", { name: "New collection" }));
  fireEvent.change(screen.getByLabelText("Collection name"), {
    target: { value: "New shortlist" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create collection" }));
  await waitFor(() =>
    expect(m.create).toHaveBeenCalledWith("New shortlist", "private"),
  );
  expect(
    await screen.findByRole("checkbox", { name: /New shortlist/ }),
  ).toBeTruthy();
});
it("reports membership failure without changing checked state", async () => {
  m.membership.mockRejectedValue(new Error("denied"));
  render(<PickerFixture appId="app1" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Add app to collections" }),
  );
  const checkbox = await screen.findByRole("checkbox", { name: /AI tools/ });
  fireEvent.click(checkbox);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Could not update",
  );
  expect((checkbox as HTMLInputElement).checked).toBe(false);
});
