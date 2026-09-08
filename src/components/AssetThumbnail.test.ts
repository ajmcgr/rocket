import { describe, expect, it } from "vitest";
import { savedDesignPreviewUrl } from "./AssetThumbnail";

describe("savedDesignPreviewUrl", () => {
  it("prefers the saved thumbnail over a legacy metadata preview", () => {
    expect(savedDesignPreviewUrl({
      thumbnail_url: "https://storage.example/current-thumbnail.png",
      image_url: "https://storage.example/source.png",
      meta: { preview_url: "data:image/png;base64,stale" },
    })).toBe("https://storage.example/current-thumbnail.png");
  });

  it("falls back to the saved source image when the thumbnail is inline", () => {
    expect(savedDesignPreviewUrl({
      thumbnail_url: "data:image/png;base64,legacy",
      image_url: "https://storage.example/source.png",
    })).toBe("https://storage.example/source.png");
  });
});
