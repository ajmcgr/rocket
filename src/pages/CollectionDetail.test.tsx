import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: null as null | { id: string },
  detail: vi.fn(),
  apps: vi.fn(),
  media: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: m.user }),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/components/SiteHeader", () => ({
  default: () => <header>Rocket</header>,
}));
vi.mock("@/components/MarketplaceCards", () => ({
  StandardAppCard: ({ app }: any) => <article>{app.name}</article>,
}));
vi.mock("@/hooks/useSavedAppControls", () => ({
  useSavedAppControls: () => () => ({ saved: false, onSave: vi.fn() }),
}));
vi.mock("@/lib/appMedia", () => ({ loadAppMedia: m.media }));
vi.mock("@/lib/appCardMetadata", () => ({ loadAppCardMetadata: m.metadata }));
vi.mock("@/lib/collections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/collections")>()),
  collectionDetail: m.detail,
  collectionApps: m.apps,
}));
import CollectionDetail from "./CollectionDetail";
import { Route } from "@/routes/collections.$slug";
const collection = {
  id: "c1",
  name: "Useful tools",
  slug: "useful-stable",
  username: "alex",
  full_name: "Alex",
  app_count: 50,
  logos: [],
  updated_at: null,
  visibility: "public" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.user = null;
  m.detail.mockResolvedValue(collection);
  m.apps.mockResolvedValue([]);
  m.media.mockResolvedValue(new Map());
  m.metadata.mockResolvedValue(new Map());
});
afterEach(cleanup);
it("includes collection title, curator and app content in initial HTML without owner controls", () => {
  const html = renderToStaticMarkup(
    <CollectionDetail
      slug={collection.slug}
      initial={{ collection, apps: [{ id: "a1", name: "App One" } as any] }}
    />,
  );
  expect(html).toContain("Useful tools");
  expect(html).toContain("Alex");
  expect(html).toContain("App One");
  expect(html).not.toContain("Manage collection");
});
it("paginates apps and batches optional media/metadata without per-app queries", async () => {
  const apps = Array.from({ length: 25 }, (_, i) => ({
    id: `a${i}`,
    name: `App ${i}`,
  }));
  m.apps.mockResolvedValue(apps);
  render(<CollectionDetail slug={collection.slug} />);
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(24));
  expect(m.apps).toHaveBeenCalledTimes(1);
  expect(m.media.mock.calls.at(-1)?.[0]).toHaveLength(24);
  expect(m.metadata.mock.calls.at(-1)?.[0]).toHaveLength(24);
  expect(screen.getByRole("button", { name: "Show more apps" })).toBeTruthy();
});
it("never falls back to owner data when public access disappears", async () => {
  m.detail.mockResolvedValue(null);
  render(
    <CollectionDetail
      slug={collection.slug}
      initial={{ collection, apps: [] }}
    />,
  );
  await screen.findByRole("heading", {
    name: "Collection not found or private",
  });
  expect(screen.queryByText("Useful tools")).toBeNull();
  expect(m.detail).toHaveBeenCalledWith(collection.slug, false);
  expect(m.apps).not.toHaveBeenCalled();
});
it("clears personal collection state immediately when the signed-in account changes", async () => {
  m.user = { id: "A" };
  m.detail.mockResolvedValue({ ...collection, visibility: "private" });
  const ui = render(<CollectionDetail slug={collection.slug} personal />);
  await screen.findByRole("heading", { name: "Useful tools" });
  m.user = { id: "B" };
  m.detail.mockImplementation(() => new Promise(() => {}));
  ui.rerender(<CollectionDetail slug={collection.slug} personal />);
  expect(screen.queryByRole("heading", { name: "Useful tools" })).toBeNull();
});
it("uses canonical/OG metadata for public collections and generic noindex metadata for private ones", () => {
  const head = Route.options.head! as (args: any) => any;
  const publicHead = head({ loaderData: { collection, apps: [] } });
  expect(publicHead.links).toContainEqual({
    rel: "canonical",
    href: "https://tryrocket.ai/collections/useful-stable",
  });
  expect(publicHead.meta).toContainEqual({
    property: "og:title",
    content: "Useful tools | Rocket",
  });
  const privateHead = head({ loaderData: { collection: null, apps: [] } });
  expect(privateHead.meta).toContainEqual({
    name: "robots",
    content: "noindex, nofollow",
  });
  expect(JSON.stringify(privateHead)).not.toContain("Useful tools");
});
