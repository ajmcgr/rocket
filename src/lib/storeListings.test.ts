import { describe, expect, it, vi } from "vitest";
import {
  appleStoreApp,
  googlePlayApp,
  storeListing,
  storeImageUrl,
  storeSubmissionMedia,
} from "../../supabase/functions/_shared/storeListings";
import {
  classifySource,
  normalizeSourceUrl,
  parsePublicUrl,
} from "../../supabase/functions/_shared/appIngestion";
const apple = storeListing(
  "https://apps.apple.com/gb/app/example/id12345?utm_source=ad",
)!;
const play = storeListing(
  "https://play.google.com/store/apps/details?id=com.example.app&hl=fr",
)!;
const png = (w: number, h: number) => {
  const b = new Uint8Array(24);
  b.set([137, 80, 78, 71]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const appData = {
  trackId: 12345,
  kind: "software",
  trackName: "Example",
  description: "A useful mobile app for independent teams.",
  artworkUrl512: "https://is1-ssl.mzstatic.com/icon.png",
  screenshotUrls: ["https://is1-ssl.mzstatic.com/portrait.png"],
  primaryGenreName: "Social Networking",
  sellerUrl: "https://example.com",
};
const playHtml = (id = "com.example.app") =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "SoftwareApplication", name: "Example", url: `https://play.google.com/store/apps/details/Example?id=${id}`, operatingSystem: "ANDROID", description: "Short tagline", image: "https://play-lh.googleusercontent.com/icon", applicationCategory: "COMMUNICATION", author: { url: "https://example.com" } })}</script><div data-g-id="description">Long description for the mobile app.<br>Useful for teams.</div><img alt="Screenshot image" data-screenshot-index="0" src="https://play-lh.googleusercontent.com/shot" srcset="https://play-lh.googleusercontent.com/large 2x"><img alt="Screenshot image" data-screenshot-index="1" src="https://attacker.com/shot">`;

describe("mobile store import adapters", () => {
  it("uses numeric IDs/package IDs across storefronts and tracking variants", () => {
    expect(apple).toMatchObject({
      type: "apple_app_store",
      id: "12345",
      country: "gb",
      url: "https://apps.apple.com/app/id12345",
    });
    expect(
      normalizeSourceUrl("https://apps.apple.com/us/app/renamed/id12345"),
    ).toBe(apple.url);
    expect(
      normalizeSourceUrl(
        "https://play.google.com/store/apps/details?hl=en&id=com.example.app&utm_source=x",
      ),
    ).toBe(play.url);
    expect(classifySource(parsePublicUrl(apple.url))).toBe("apple_app_store");
    expect(classifySource(parsePublicUrl(play.url))).toBe("google_play");
    expect(
      storeListing("https://apps.apple.com.attacker.com/app/id12345"),
    ).toBeNull();
  });
  it.each([
    "https://apps.apple.com/us/genre/apps/",
    "https://apps.apple.com/app/id123/extra",
    "http://apps.apple.com/app/id123",
    "https://user@play.google.com/store/apps/details?id=com.example.app",
    "https://play.google.com/store/apps/details?id=not-a-package",
    "https://play.google.com/store/apps/developer?id=com.example.app",
  ])("rejects malformed or non-listing store URLs: %s", (url) =>
    expect(() => storeListing(url)).toThrow(),
  );
  it("maps only the requested Apple app and keeps the actual developer website", () => {
    const result = appleStoreApp(apple, { results: [appData] });
    expect(result).toMatchObject({
      name: "Example",
      platforms: ["ios"],
      category: "Social & Community",
      developerWebsite: "https://example.com/",
    });
    expect(result.screenshots).toHaveLength(1);
    expect(() =>
      appleStoreApp(apple, { results: [{ ...appData, trackId: 999 }] }),
    ).toThrow();
    expect(() => appleStoreApp(apple, { results: [] })).toThrow();
    expect(
      appleStoreApp(apple, { results: [{ ...appData, kind: "mac-software" }] })
        .platforms,
    ).toEqual(["macos"]);
  });
  it("reads Google structured identity and screenshot elements without evaluating scripts", () => {
    const result = googlePlayApp(
      play,
      playHtml() + "<script>throw new Error('never executed')</script>",
    );
    expect(result).toMatchObject({
      name: "Example",
      platforms: ["android"],
      category: "Social & Community",
      description: "Long description for the mobile app.\nUseful for teams.",
    });
    expect(result.screenshots).toEqual([
      "https://play-lh.googleusercontent.com/large",
    ]);
    expect(() => googlePlayApp(play, playHtml("com.other.app"))).toThrow();
    expect(() => googlePlayApp(play, "<html>Consent required</html>")).toThrow(
      /manually/,
    );
  });
  it("validates square artwork, keeps portrait screenshots, and never invents a landscape cover", async () => {
    const app = appleStoreApp(apple, { results: [appData] });
    const result = await storeSubmissionMedia(app, async (url) => ({
      url,
      bytes: url.includes("icon") ? png(512, 512) : png(600, 1200),
    }));
    expect(result.logo_url).toBe(app.icon);
    expect(result.screenshots).toEqual(app.screenshots);
    expect(result.hero_url).toBeNull();
    const wide = await storeSubmissionMedia(app, async (url) => ({
      url,
      bytes: url.includes("icon") ? png(512, 512) : png(1200, 630),
    }));
    expect(wide.hero_url).toBe(app.screenshots[0]);
  });
  it("rejects foreign CDNs, unsafe redirects and broken artwork while retaining listing identity", async () => {
    expect(
      storeImageUrl(
        "https://is1-ssl.mzstatic.com.attacker.com/icon.png",
        apple.type,
      ),
    ).toBeNull();
    expect(
      storeImageUrl("http://play-lh.googleusercontent.com/icon", play.type),
    ).toBeNull();
    const app = appleStoreApp(apple, { results: [appData] });
    const fetch = vi.fn(async () => ({
      url: "https://attacker.com/image.png",
      bytes: png(512, 512),
    }));
    expect(await storeSubmissionMedia(app, fetch)).toEqual({
      logo_url: null,
      hero_url: null,
      screenshots: [],
      allowed_urls: [],
    });
  });
});
