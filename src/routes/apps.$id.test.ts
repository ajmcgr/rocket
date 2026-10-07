import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), media: vi.fn(async () => new Map()) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }) }) } }));
vi.mock("@/lib/appMedia", () => ({ loadAppMedia: mocks.media }));
import { Route } from "./apps.$id";
const id = "b202d75a-02ae-46e6-8419-5b3410cbaac8";
const load = (value: string, searchStr = "", hash = "") => (Route.options.loader as Function)({ params: { id: value }, location: { searchStr, hash } });
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ data: { id, slug: "launch", name: "Launch" }, error: null }); });
it("permanently redirects old UUID URLs while preserving save intent and fragments", async () => {
  await expect(load(id, "?save=1", "reviews")).rejects.toMatchObject({ status: 301, options: { href: "/apps/launch?save=1#reviews", replace: true } });
  expect(mocks.media).not.toHaveBeenCalled();
});
it("loads canonical name URLs without a redirect loop", async () => {
  await expect(load("launch")).resolves.toMatchObject({ app: { id, slug: "launch" } });
});
it("keeps missing legacy app URLs as not-found", async () => {
  mocks.query.mockResolvedValue({ data: null, error: null });
  await expect(load(id)).resolves.toEqual({ app: null, media: [] });
});
