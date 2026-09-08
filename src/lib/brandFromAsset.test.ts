import { describe, expect, it } from "vitest";
import { assetCoverUrl } from "./brandFromAsset";

describe("assetCoverUrl", () => {
  it("uses the persisted image URL for a Brand Kit cover", () => {
    expect(assetCoverUrl({ id: "logo", image_url: "https://storage.example/logo.png" }))
      .toBe("https://storage.example/logo.png");
  });

  it("never persists an inline preview as a project cover", () => {
    expect(assetCoverUrl({
      id: "logo",
      image_url: "data:image/png;base64,inline",
      thumbnail_url: "https://storage.example/thumbnail.png",
    })).toBe("https://storage.example/thumbnail.png");
  });

  it("falls back to a stored metadata cover when no direct field exists", () => {
    expect(assetCoverUrl({
      id: "logo",
      meta: { cover_url: "https://storage.example/cover.png" },
    })).toBe("https://storage.example/cover.png");
  });
});
