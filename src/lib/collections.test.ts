import { expect, it, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  from: vi.fn(),
  calls: [] as [string, unknown[]][],
  data: [] as unknown[],
  error: null as null | { code: string },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from },
}));
import {
  collectionApps,
  collectionDetail,
  collectionPath,
  createCollection,
  publicCollections,
  setCollectionMembership,
} from "./collections";
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.data = [];
  m.error = null;
  m.from.mockImplementation((table: string) => {
    m.calls.push(["from", [table]]);
    const q: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: m.data, error: m.error }).then(resolve),
    };
    for (const key of [
      "select",
      "gt",
      "order",
      "range",
      "eq",
      "insert",
      "delete",
      "maybeSingle",
      "single",
    ])
      q[key] = (...args: unknown[]) => {
        m.calls.push([key, args]);
        return q;
      };
    return q;
  });
});
it("uses the public-only projection and excludes empty discovery collections", async () => {
  await publicCollections(24, "alex");
  expect(m.calls).toContainEqual(["from", ["public_user_collections"]]);
  expect(m.calls).toContainEqual(["gt", ["app_count", 0]]);
  expect(m.calls).toContainEqual(["eq", ["username", "alex"]]);
  expect(m.calls).toContainEqual(["range", [24, 48]]);
  expect(m.calls).toContainEqual(["order", ["id"]]);
});
it("queries public detail without using a private fallback", async () => {
  await collectionDetail("private-slug");
  expect(m.calls.filter(([key]) => key === "from")).toEqual([
    ["from", ["public_user_collections"]],
  ]);
});
it("loads an entire visible app page with one query rather than one per app", async () => {
  m.data = Array.from({ length: 25 }, (_, i) => ({ id: `app${i}` }));
  expect(await collectionApps("c1")).toHaveLength(25);
  expect(m.from).toHaveBeenCalledTimes(1);
  expect(m.calls).toContainEqual(["from", ["collection_visible_apps"]]);
});
it("creates with default private visibility and does not send owner/slug/IDs", async () => {
  await createCollection("  My apps  ");
  expect(m.calls).toContainEqual([
    "insert",
    [{ name: "My apps", visibility: "private" }],
  ]);
});
it("treats duplicate adds as success, but never swallows authorization errors", async () => {
  m.error = { code: "23505" };
  await expect(
    setCollectionMembership("c1", "a1", true),
  ).resolves.toBeUndefined();
  m.error = { code: "42501" };
  await expect(setCollectionMembership("c1", "a1", true)).rejects.toEqual(
    m.error,
  );
});
it("uses stable slugs for public and owner routes, preserving Saved legacy URL", () => {
  const c = {
    id: "id",
    name: "Renamed",
    slug: "stable-id",
    app_count: 1,
    updated_at: null,
    logos: [],
  };
  expect(collectionPath(c)).toBe("/collections/stable-id");
  expect(collectionPath(c, true)).toBe("/my-collections/stable-id");
  expect(collectionPath({ ...c, id: undefined, slug: "saved" }, true)).toBe(
    "/saved-apps",
  );
});
