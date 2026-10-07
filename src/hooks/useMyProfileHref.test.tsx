import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { useMyProfileHref } from "./useMyProfileHref";

const mocks = vi.hoisted(() => ({ read: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (...args: unknown[]) => {
    mocks.eq(...args); return { maybeSingle: mocks.read };
  } }) }),
} }));
const owner = { id: "owner", user_metadata: { username: "alex" } } as unknown as User;
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: null, error: null }); });

it("opens setup for a metadata username without a published profile", async () => {
  const { result } = renderHook(() => useMyProfileHref(owner));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(result.current).toBe("/settings/profile");
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
});
it("uses the saved username rather than stale auth metadata", async () => {
  mocks.read.mockResolvedValue({ data: { username: "published_name" }, error: null });
  const { result } = renderHook(() => useMyProfileHref(owner));
  await waitFor(() => expect(result.current).toBe("/@published_name"));
});
it("never reuses another user's destination and ignores stale responses", async () => {
  let resolveOld!: (value: unknown) => void;
  mocks.read.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const { result, rerender } = renderHook(({ user }) => useMyProfileHref(user), { initialProps: { user: owner } });
  rerender({ user: { ...owner, id: "other" } });
  resolveOld({ data: { username: "alex" }, error: null });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2));
  expect(result.current).toBe("/settings/profile");
});
it("falls back to setup when the lookup fails", async () => {
  mocks.read.mockResolvedValue({ data: { username: "alex" }, error: { message: "unavailable" } });
  const { result } = renderHook(() => useMyProfileHref(owner));
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  expect(result.current).toBe("/settings/profile");
});
it("refreshes the destination after the signed-in user is updated on save", async () => {
  const { result, rerender } = renderHook(({ user }) => useMyProfileHref(user), { initialProps: { user: owner } });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  mocks.read.mockResolvedValue({ data: { username: "alex" }, error: null });
  rerender({ user: { ...owner } });
  await waitFor(() => expect(result.current).toBe("/@alex"));
});
