import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PublicMemberApps from "./PublicMemberApps";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), saved: vi.fn(), cards: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/appMedia", () => ({ loadAppMedia: vi.fn(async () => new Map()) }));
vi.mock("@/lib/appCardMetadata", () => ({ loadAppCardMetadata: vi.fn(async () => new Map()) }));
vi.mock("@/hooks/useSavedAppControls", () => ({ useSavedAppControls: () => (id: string) => ({ saved: id === "saved", onSave: mocks.saved }) }));
vi.mock("./MarketplaceLoadingSkeletons", () => ({ AppCardSkeleton: () => <div>Skeleton</div> }));
vi.mock("./MarketplaceCards", () => ({ StandardAppCard: (props: any) => {
  mocks.cards(props);
  return <article>{props.app.name}<button aria-label={`Save ${props.app.name}`} aria-pressed={props.saved} onClick={() => props.onSave(true)}>Save</button></article>;
} }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it("uses public ownership lookup and homepage cards with visitor bookmark controls", async () => {
  mocks.rpc.mockResolvedValue({ data: [{ id: "saved", name: "Launch" }], error: null });
  const ui = render(<PublicMemberApps username="alex" />);
  await waitFor(() => expect(ui.getByText("Launch")).toBeTruthy());
  expect(mocks.rpc).toHaveBeenCalledWith("get_public_member_apps", { p_username: "alex", p_offset: 0 });
  expect(ui.getByRole("button", { name: "Save Launch" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(ui.getByRole("button", { name: "Save Launch" }));
  expect(mocks.saved).toHaveBeenCalledWith(true);
});
it("shows an honest empty state", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  const ui = render(<PublicMemberApps username="empty" />);
  await waitFor(() => expect(ui.getByText("No public apps yet.")).toBeTruthy());
});
it("allows retry after a failed lookup", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: new Error("offline") }).mockResolvedValueOnce({ data: [], error: null });
  const ui = render(<PublicMemberApps username="alex" />);
  await waitFor(() => expect(ui.getByRole("button", { name: "Try again" })).toBeTruthy());
  fireEvent.click(ui.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(ui.getByText("No public apps yet.")).toBeTruthy());
});
it("loads additional public apps without repeating cards", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: Array.from({ length: 25 }, (_, id) => ({ id: String(id), name: `App ${id}` })), error: null })
    .mockResolvedValueOnce({ data: [{ id: "24", name: "App 24" }], error: null });
  const ui = render(<PublicMemberApps username="alex" />);
  await waitFor(() => expect(ui.getByRole("button", { name: "Show more apps" })).toBeTruthy());
  expect(ui.queryByText("App 24")).toBeNull();
  fireEvent.click(ui.getByRole("button", { name: "Show more apps" }));
  await waitFor(() => expect(ui.getByText("App 24")).toBeTruthy());
  expect(mocks.rpc).toHaveBeenLastCalledWith("get_public_member_apps", { p_username: "alex", p_offset: 24 });
  expect(ui.getAllByRole("article")).toHaveLength(25);
});
