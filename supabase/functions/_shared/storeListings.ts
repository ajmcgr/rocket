import { submissionCategory, submissionImageSize } from "./submissionImport.ts";
import { submissionWebsite } from "./appSubmission.ts";

export type StoreType = "apple_app_store" | "google_play";
export type StoreListing = {
  type: StoreType;
  id: string;
  url: string;
  country: string;
};
export type StoreApp = {
  listing: StoreListing;
  observed?: boolean;
  name: string;
  description: string;
  icon: string | null;
  screenshots: string[];
  category: string | null;
  platforms: string[];
  developerWebsite: string;
};

export function storeListing(input: string | URL): StoreListing | null {
  const u = new URL(input.toString());
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!["apps.apple.com", "play.google.com"].includes(host)) return null;
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Use an HTTPS App Store or Google Play listing URL");
  if (host === "apps.apple.com") {
    const match =
      /^\/(?:([a-z]{2})\/)?app\/(?:[^/]+\/)?id([1-9][0-9]{0,19})\/?$/i.exec(
        u.pathname,
      );
    if (!match)
      throw new Error(
        "Paste an Apple App Store app listing ending in its numeric app ID",
      );
    return {
      type: "apple_app_store",
      id: match[2],
      url: `https://apps.apple.com/app/id${match[2]}`,
      country: (match[1] || "us").toLowerCase(),
    };
  }
  const id = u.searchParams.get("id") || "";
  if (
    u.pathname !== "/store/apps/details" ||
    id.length > 255 ||
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(id)
  )
    throw new Error("Paste a Google Play app listing with its package ID");
  return {
    type: "google_play",
    id,
    url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}`,
    country: "us",
  };
}

function plain(value: unknown, max = 2000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,
      (entity) => {
        const named: Record<string, string> = {
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
          "&nbsp;": " ",
        };
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        const code = parseInt(
          entity.slice(entity[2]?.toLowerCase() === "x" ? 3 : 2, -1),
          entity[2]?.toLowerCase() === "x" ? 16 : 10,
        );
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      },
    )
    .trim()
    .slice(0, max);
}
function developerWebsite(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(submissionWebsite(value));
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname.includes(".") &&
      !storeListing(u)
      ? u.toString()
      : "";
  } catch {
    return "";
  }
}
export function storeImageUrl(value: unknown, type: StoreType): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    const trusted =
      type === "apple_app_store"
        ? /^(?:is\d+(?:-ssl)?|a\d+)\.mzstatic\.com$/.test(u.hostname)
        : [
            "play-lh.googleusercontent.com",
            "play.googleusercontent.com",
          ].includes(u.hostname);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      trusted
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
function storeCategory(value: unknown): string | null {
  const genre = plain(value, 80).replaceAll("_", " ").toLowerCase();
  const aliases: Record<string, string> = {
    communication: "Social & Community",
    social: "Social & Community",
    "social networking": "Social & Community",
    tools: "Utilities",
    photography: "Photo & Video",
    "video players": "Video",
    "maps and navigation": "Navigation",
    "maps & navigation": "Navigation",
    "news and magazines": "News",
    "news & magazines": "News",
    "books and reference": "Books",
    "books & reference": "Books",
    "art and design": "Design & Creative",
    "art & design": "Design & Creative",
  };
  return submissionCategory(genre) || aliases[genre] || null;
}
export function appleStoreApp(listing: StoreListing, data: unknown): StoreApp {
  const result = data as { results?: Array<Record<string, unknown>> };
  const app = result?.results?.find(
    (r) =>
      String(r.trackId) === listing.id &&
      ["software", "mac-software"].includes(String(r.kind)),
  );
  if (!app || !plain(app.trackName, 120))
    throw new Error(
      "This app is unavailable in that App Store region. Try another country’s listing or add details manually.",
    );
  const screenshots = [
    ...(Array.isArray(app.screenshotUrls) ? app.screenshotUrls : []),
    ...(Array.isArray(app.ipadScreenshotUrls) ? app.ipadScreenshotUrls : []),
  ];
  return {
    listing,
    observed: true,
    name: plain(app.trackName, 120),
    description: plain(app.description),
    icon: storeImageUrl(app.artworkUrl512 || app.artworkUrl100, listing.type),
    screenshots: [
      ...new Set(
        screenshots
          .map((u) => storeImageUrl(u, listing.type))
          .filter((u): u is string => !!u),
      ),
    ].slice(0, 6),
    category: storeCategory(app.primaryGenreName),
    platforms: [app.kind === "mac-software" ? "macos" : "ios"],
    developerWebsite: developerWebsite(app.sellerUrl),
  };
}
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    attrs[m[1].toLowerCase()] = plain(m[2] ?? m[3], 5000);
  return attrs;
}
export function googlePlayApp(listing: StoreListing, html: string): StoreApp {
  let app: Record<string, unknown> | undefined;
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(match[1]);
      const records = Array.isArray(data)
        ? data
        : [data, ...(Array.isArray(data?.["@graph"]) ? data["@graph"] : [])];
      app = records.find(
        (r) =>
          r?.["@type"] === "SoftwareApplication" &&
          r.operatingSystem === "ANDROID",
      );
      if (app) break;
    } catch {
      /* Do not execute page scripts to extract metadata. */
    }
  }
  // Google sometimes includes the app name in the canonical details path.
  let observedId = "";
  try {
    const u = new URL(String(app?.url));
    if (
      u.hostname === "play.google.com" &&
      /^\/store\/apps\/details(?:\/[^/]+)?$/.test(u.pathname)
    )
      observedId = u.searchParams.get("id") || "";
  } catch {}
  if (!app || observedId !== listing.id || !plain(app.name, 120))
    throw new Error(
      "Google Play did not return a readable listing for this app. Try again or add details manually.",
    );
  const screenshots: string[] = [];
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attributes(tag[0]);
    if (
      a.alt !== "Screenshot image" ||
      !/^\d+$/.test(a["data-screenshot-index"] || "")
    )
      continue;
    const observed =
      a.srcset
        ?.split(",")
        .map((v) => v.trim().split(/\s+/)[0])
        .pop() || a.src;
    const image = storeImageUrl(observed, listing.type);
    if (image && !screenshots.includes(image)) screenshots.push(image);
    if (screenshots.length === 6) break;
  }
  const body =
    /<div\b[^>]*data-g-id=["']description["'][^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1];
  return {
    listing,
    observed: true,
    name: plain(app.name, 120),
    description: plain(body || app.description),
    icon: storeImageUrl(app.image, listing.type),
    screenshots,
    category: storeCategory(app.applicationCategory),
    platforms: ["android"],
    developerWebsite: developerWebsite((app.author as { url?: unknown })?.url),
  };
}

export async function storeSubmissionMedia(
  app: StoreApp,
  fetchImage: (url: string) => Promise<{ url: string; bytes: Uint8Array }>,
) {
  const candidates = [
    ...new Set([app.icon, ...app.screenshots].filter((u): u is string => !!u)),
  ];
  const checked = await Promise.all(
    candidates.map(async (url) => {
      try {
        if (!storeImageUrl(url, app.listing.type)) return null;
        const result = await fetchImage(url),
          size = submissionImageSize(result.bytes);
        if (!storeImageUrl(result.url, app.listing.type) || !size) return null;
        return { original: url, url: result.url, ...size };
      } catch {
        return null;
      }
    }),
  );
  const icon = checked.find(
    (i) => i?.original === app.icon && i.width === i.height && i.width >= 128,
  );
  const screenshots = checked.filter(
    (i) =>
      i &&
      app.screenshots.includes(i.original) &&
      i.width >= 200 &&
      i.height >= 200,
  );
  const hero = screenshots.find((i) => i!.width >= 600 && i!.width > i!.height);
  return {
    logo_url: icon?.url || null,
    hero_url: hero?.url || null,
    screenshots: screenshots.map((i) => i!.url),
    allowed_urls: checked.filter((i) => i).map((i) => i!.url),
  };
}
