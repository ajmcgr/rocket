// @vitest-environment jsdom
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEWSLETTER_SIGNUP_FLAG, rememberOAuthSignup, syncNewAccountToBeehiiv } from "./beehiivAccountSync";

const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { updateUser: mocks.updateUser },
  functions: { invoke: mocks.invoke },
} }));

const user = (minutesOld: number, flagged = false) => ({
  id: "account-1",
  created_at: new Date(Date.now() - minutesOld * 60_000).toISOString(),
  user_metadata: flagged ? { [NEWSLETTER_SIGNUP_FLAG]: true } : {},
}) as User;

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.invoke.mockResolvedValue({ error: null });
});

describe("new account newsletter sync", () => {
  it("syncs a newly created email account and retries on later auth loads", async () => {
    await syncNewAccountToBeehiiv(user(1, true));
    await syncNewAccountToBeehiiv(user(1, true));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("marks a newly created OAuth account before syncing", async () => {
    rememberOAuthSignup();
    await syncNewAccountToBeehiiv(user(1));
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { [NEWSLETTER_SIGNUP_FLAG]: true } });
    expect(mocks.invoke).toHaveBeenCalledWith("beehiiv-account-sync", { body: {} });
  });

  it("does not subscribe an existing account that logs in with OAuth", async () => {
    rememberOAuthSignup();
    await syncNewAccountToBeehiiv(user(60));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
