import { describe, expect, it } from "vitest";
import { normalizeProfile, profileFromData, publicProfileColumns, safeProfileUrl } from "./memberProfile";
describe("public member profile", () => {
  it("normalizes handles and websites", () => {
    const profile = normalizeProfile(profileFromData({ username: " @Alex ", x_username: "@alex", website: "example.com", bio: " Hello " }));
    expect(profile.username).toBe("alex"); expect(profile.x_username).toBe("alex"); expect(profile.website).toBe("https://example.com/"); expect(profile.bio).toBe("Hello");
  });
  it("rejects invalid usernames, social URLs and unsafe websites", () => {
    for (const fields of [{ username: "a" }, { username: "alex", instagram_username: "https://instagram.com/alex" }, { username: "alex", website: "javascript:alert(1)" }, { username: "alex", website: "https://user:pass@example.com" }]) expect(() => normalizeProfile(profileFromData(fields))).toThrow();
    expect(safeProfileUrl("javascript:alert(1)")).toBeUndefined();
  });
  it("publishes only explicit public fields", () => {
    const profile = profileFromData({ email: "private@example.com", user_id: "private", username: "alex" });
    expect(profile).not.toHaveProperty("email"); expect(profile).not.toHaveProperty("user_id");
    expect(publicProfileColumns).not.toContain("email"); expect(publicProfileColumns).not.toContain("user_id");
  });
});
