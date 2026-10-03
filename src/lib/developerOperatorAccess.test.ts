import { describe, expect, it, vi } from "vitest";
import { canInviteDeveloper } from "../../supabase/functions/_shared/developerOperatorAccess";

describe("internal developer invitation authorization", () => {
  it("requires both server operator and server admin authorization", async () => {
    const admin = vi.fn(async () => ({ data: true, error: null }));
    expect(await canInviteDeveloper(false, admin)).toBe(false);
    expect(admin).not.toHaveBeenCalled();
    expect(await canInviteDeveloper(true, admin)).toBe(true);
    expect(
      await canInviteDeveloper(true, async () => ({
        data: false,
        error: null,
      })),
    ).toBe(false);
  });
  it("fails closed on denied, missing, malformed and failed admin checks", async () => {
    for (const data of [null, undefined, "true", { admin: true }])
      expect(
        await canInviteDeveloper(true, async () => ({ data, error: null })),
      ).toBe(false);
    expect(
      await canInviteDeveloper(true, async () => ({
        data: true,
        error: new Error("denied"),
      })),
    ).toBe(false);
    expect(
      await canInviteDeveloper(true, async () => {
        throw new Error("offline");
      }),
    ).toBe(false);
  });
});
