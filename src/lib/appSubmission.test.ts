import { describe, expect, it } from "vitest";
import {
  emptySubmission,
  submissionSlug,
  validateSubmission,
  youtubeUrl,
} from "../../supabase/functions/_shared/appSubmission";
const valid = () => ({
  ...emptySubmission(),
  name: "Example",
  tagline: "Useful software",
  description: "A useful application for independent teams.",
  slug: "example",
  logo_url: "https://example.com/logo.png",
  hero_url: "https://example.com/hero.png",
  categories: ["Productivity"],
  platforms: ["web"],
});
describe("complete submission validation", () => {
  it("always treats submissions as founder submitted, including legacy drafts", () => {
    for (const submission_type of ["founder", "community", undefined]) {
      expect(
        validateSubmission({ ...valid(), submission_type }).submission_type,
      ).toBe("founder");
    }
  });
  it("normalizes clean app slugs and YouTube links", () => {
    expect(submissionSlug("Héllo, My App!")).toBe("hello-my-app");
    expect(youtubeUrl("https://youtu.be/dQw4w9WgXcQ?t=2")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(youtubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
  it("rejects unsupported video sites and invalid video IDs", () => {
    for (const url of [
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXc",
      "javascript:alert(1)",
      "https://youtube.com/watch?v=bad",
      "https://user@youtube.com/watch?v=dQw4w9WgXc",
    ])
      expect(() => youtubeUrl(url)).toThrow();
  });
  it("accepts complete details but never arbitrary provider fields", () => {
    expect(
      validateSubmission({
        ...valid(),
        domain_verified: true,
        payment_status: "active",
      }),
    ).toEqual(valid());
  });
  it("requires category, platform, icon, hero image and useful description", () => {
    for (const patch of [
      { categories: [] },
      { platforms: [] },
      { platforms: ["not-a-platform"] },
      { logo_url: "" },
      { hero_url: "" },
      { description: "too short" },
      { slug: "Bad Slug" },
      { screenshots: Array(7).fill("https://example.com/image.png") },
    ])
      expect(() => validateSubmission({ ...valid(), ...patch })).toThrow();
  });
});
