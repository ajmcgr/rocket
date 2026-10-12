import React from "npm:react@19.2.0";
import { ImageResponse } from "npm:@vercel/og@0.8.5";
import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { fetchPublicBytes } from "../_shared/appIngestion.ts";
import { interBoldBase64, interRegularBase64, rocketLogo } from "./brandAssets.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
const formats = { landscape: [1200, 630], square: [1080, 1080], portrait: [1080, 1920] } as const;
const notFound = () => new Response("Card unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
const renderWindows = new Map<string, { count: number; until: number }>();
function allowRender(req: Request, key: string) {
  const address = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!address) return true;
  const now = Date.now();
  if (renderWindows.size > 2_000) {
    for (const [entry, value] of renderWindows) if (value.until < now) renderWindows.delete(entry);
    while (renderWindows.size > 2_000) renderWindows.delete(renderWindows.keys().next().value!);
  }
  const bucket = `${address}:${key}`;
  const value = renderWindows.get(bucket);
  if (!value || value.until < now) { renderWindows.set(bucket, { count: 1, until: now + 60_000 }); return true; }
  if (value.count >= 20) return false;
  value.count += 1;
  return true;
}

function safeRasterSize(bytes: Uint8Array, type: "png" | "jpeg" | "webp") {
  let width = 0; let height = 0;
  if (type === "png" && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (type === "jpeg") {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (length < 2 || i + 2 + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        height = (bytes[i + 5] << 8) | bytes[i + 6]; width = (bytes[i + 7] << 8) | bytes[i + 8]; break;
      }
      i += 2 + length;
    }
  } else if (type === "webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === "VP8X") {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
      width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    }
  }
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 8_000_000;
}

// The ingestion fetcher resolves and pins public IPs, rejects private networks,
// limits redirects and caps bytes. Embed validated raster bytes so the image
// renderer never follows an app-supplied URL itself.
async function rasterDataUrl(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !/^https:\/\//i.test(value) || value.length > 2048) return null;
  try {
    // Some public image hosts are slow or redirect repeatedly. A missing image
    // is preferable to timing out the whole social card request.
    const result = await Promise.race([
      fetchPublicBytes(value, 2_000_000),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Image timeout")), 5_000)),
    ]);
    const b = result.bytes;
    const png = b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
    const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255;
    const webp = new TextDecoder().decode(b.slice(0, 4)) === "RIFF" && new TextDecoder().decode(b.slice(8, 12)) === "WEBP";
    if (!png && !jpeg && !webp) return null;
    if (!safeRasterSize(b, png ? "png" : jpeg ? "jpeg" : "webp")) return null;
    let binary = "";
    for (let i = 0; i < b.length; i += 8192) binary += String.fromCharCode(...b.slice(i, i + 8192));
    return `data:image/${png ? "png" : jpeg ? "jpeg" : "webp"};base64,${btoa(binary)}`;
  } catch { return null; }
}

type Card = { title: string; detail: string; kicker: string; url: string; logo: string | null; cover: string | null; logos?: string[] };

async function loadCard(kind: string, id: string, includeCover: boolean): Promise<Card | null> {
  if (kind === "app") {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
    if (!isUuid && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
    const { data: app, error } = await db.from("public_apps").select("id,slug,name,tagline,description,logo_url,categories").eq(isUuid ? "id" : "slug", id).maybeSingle();
    if (error || !app) return null;
    const { data: media } = includeCover ? await db.from("public_app_media_covers").select("source_url").eq("app_id", app.id).limit(1) : { data: null };
    const [logo, cover] = await Promise.all([rasterDataUrl(app.logo_url), includeCover ? rasterDataUrl(media?.[0]?.source_url) : Promise.resolve(null)]);
    return { title: app.name.slice(0, 120), detail: (app.tagline || app.description || "Explore this app on Rocket").slice(0, 180), kicker: app.categories?.[0] || "App on Rocket", url: `tryrocket.ai/apps/${app.slug}`, logo, cover };
  }
  if (kind === "profile") {
    if (!/^[a-z0-9_]{2,30}$/.test(id)) return null;
    const { data: profile, error } = await db.from("member_public_profiles").select("username,bio,avatar_url").eq("username", id).maybeSingle();
    if (error || !profile) return null;
    const { data: apps } = await db.rpc("get_public_member_apps", { p_username: id, p_offset: 0 });
    const count = Array.isArray(apps) ? apps.length : 0;
    return { title: `@${profile.username}`, detail: profile.bio?.slice(0, 180) || "Building on Rocket", kicker: count ? count >= 25 ? "25 or more public apps" : `${count} public apps` : "Developer profile", url: `tryrocket.ai/@${profile.username}`, logo: await rasterDataUrl(profile.avatar_url), cover: null };
  }
  if (kind === "collection") {
    if (!/^[a-z0-9-]{1,100}$/.test(id)) return null;
    const { data: collection, error } = await db.from("public_user_collections").select("id,name,slug,username,app_count,logos").eq("slug", id).maybeSingle();
    if (error || !collection || !collection.id) return null;
    const logos = (Array.isArray(collection.logos) ? collection.logos.slice(0, 4) : []);
    const images = (await Promise.all(logos.map(rasterDataUrl))).filter((image): image is string => Boolean(image));
    return { title: collection.name.slice(0, 120), detail: `${collection.app_count} public apps curated by ${collection.username ? `@${collection.username}` : "a Rocket member"}`, kicker: "Public collection", url: `tryrocket.ai/collections/${collection.slug}`, logo: null, cover: null, logos: images };
  }
  return null;
}

function artwork(card: Card, width: number, height: number) {
  const portrait = height > width;
  const square = height === width;
  const pad = portrait ? 72 : square ? 64 : 48;
  const visualWidth = portrait ? 936 : square ? 952 : 636;
  const visualHeight = portrait ? 770 : square ? 570 : 410;
  const coverZoom = square ? 1.27 : 1.48;
  const logoSize = portrait ? 144 : square ? 112 : 104;
  const nameSize = portrait ? (card.title.length > 20 ? 76 : 100) : square ? (card.title.length > 22 ? 62 : 82) : card.title.length > 18 ? 50 : 68;
  const visual = <div style={{ display: "flex", width: visualWidth, height: visualHeight, flexShrink: 0, alignItems: card.cover && !portrait ? "flex-start" : "center", justifyContent: "center", overflow: "hidden", borderRadius: portrait ? 42 : 28, backgroundColor: "#eef7fc", border: "2px solid #dcebf5" }}>
    {card.cover && !portrait ? <img src={card.cover} width={Math.round(visualWidth * coverZoom)} height={Math.round(visualHeight * coverZoom)} style={{ objectFit: "cover", objectPosition: "top", flexShrink: 0 }} /> : card.logos?.length ? <div style={{ display: "flex", gap: 24, alignItems: "center" }}>{card.logos.map((logo, index) => <img key={index} src={logo} width={portrait ? 190 : 130} height={portrait ? 190 : 130} style={{ borderRadius: 28, objectFit: "contain" }} />)}</div> : card.logo ? <img src={card.logo} width={portrait ? 390 : square ? 280 : 230} height={portrait ? 390 : square ? 280 : 230} style={{ borderRadius: portrait ? 80 : 50, objectFit: "contain" }} /> : <span style={{ display: "flex", fontSize: portrait ? 240 : 150, color: "#469DDA", fontWeight: 700 }}>{card.title.slice(0, 1).toUpperCase()}</span>}
  </div>;
  const identity = <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 32 : 24, alignItems: portrait ? "flex-start" : "center", width: portrait ? 936 : square ? 952 : 420 }}>
    {card.logo ? <img src={card.logo} width={logoSize} height={logoSize} style={{ borderRadius: portrait ? 32 : 24, objectFit: "contain", backgroundColor: "#f3f7fa" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: logoSize, height: logoSize, borderRadius: 24, backgroundColor: "#dceffb", color: "#2389cb", fontSize: 65, fontWeight: 700 }}>{card.title.slice(0, 1).toUpperCase()}</div>}
    <div style={{ display: "flex", flexDirection: "column", width: portrait ? 936 : square ? 810 : 290 }}>
      <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.03, maxHeight: portrait ? 260 : square ? 178 : 145, overflow: "hidden" }}>{card.title}</div>
      <div style={{ display: "flex", marginTop: 12, color: "#536173", fontSize: portrait ? 36 : square ? 31 : 27, lineHeight: 1.25, maxHeight: portrait ? 180 : 128, overflow: "hidden" }}>{card.detail}</div>
    </div>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", width, height, overflow: "hidden", padding: pad, backgroundColor: "#fff", color: "#111827", fontFamily: "Inter" }}>
    <div style={{ display: "flex", width: width - pad * 2, height: portrait ? 85 : 65, flexShrink: 0, alignItems: "center", justifyContent: "space-between" }}>
      <img src={rocketLogo} width={portrait ? 225 : 185} height={portrait ? 79 : 65} style={{ objectFit: "contain" }} />
      <span style={{ display: "flex", maxWidth: portrait ? 470 : 390, overflow: "hidden", color: "#469DDA", fontSize: portrait ? 25 : 21, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2 }}>{card.kicker}</span>
    </div>
    {portrait ? <div style={{ display: "flex", flexDirection: "column", marginTop: 120 }}>
      {identity}
      <div style={{ display: "flex", width: 150, height: 9, borderRadius: 9, backgroundColor: "#469DDA", marginTop: 74, marginBottom: 74 }} />
      {visual}
    </div> : square ? <div style={{ display: "flex", flexDirection: "column", marginTop: 38 }}>
      {identity}
      <div style={{ display: "flex", marginTop: 36 }}>{visual}</div>
    </div> : <div style={{ display: "flex", flexDirection: "row", gap: 32, marginTop: 36, alignItems: "center", height: 410 }}>
      <div style={{ display: "flex", flexDirection: "column", width: 420, height: 410, justifyContent: "center" }}>{identity}<div style={{ display: "flex", width: 96, height: 8, borderRadius: 8, backgroundColor: "#469DDA", marginTop: 32 }} /></div>
      {visual}
    </div>}
    <div style={{ display: "flex", width: width - pad * 2, alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 18, borderTop: "2px solid #dbe5ec", color: "#536173", fontSize: portrait ? 25 : 20 }}>
      <span>The open app platform for builders.</span><span style={{ color: "#2389cb", fontWeight: 700 }}>{card.url}</span>
    </div>
  </div>;
}

function decodeFont(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const cardFonts = [
  { name: "Inter", data: decodeFont(interRegularBase64), style: "normal" as const, weight: 400 as const },
  { name: "Inter", data: decodeFont(interBoldBase64), style: "normal" as const, weight: 700 as const },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405 });
  const params = new URL(req.url).searchParams;
  const kind = params.get("kind") || "";
  const id = params.get("id") || "";
  const variant = params.get("variant") || "landscape";
  const version = params.get("v");
  if (!(variant in formats) || id.length > 120 || (version !== null && !/^[a-z0-9]{1,16}$/i.test(version)) || !["app", "profile", "collection"].includes(kind)) return notFound();
  if (!allowRender(req, `${kind}:${id}:${variant}`)) return new Response("Card request limit reached", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  try {
    const card = await loadCard(kind, id, variant !== "portrait");
    if (!card) return notFound();
    if (req.method === "HEAD") return new Response(null, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
    const [width, height] = formats[variant as keyof typeof formats];
    const image = new ImageResponse(artwork(card, width, height), { width, height, fonts: cardFonts });
    const headers = new Headers(image.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", kind === "collection" ? "public, max-age=30" : "public, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") return new Response(null, { headers });
    return new Response(image.body, { status: image.status, headers });
  } catch (error) {
    console.error("share card render failed", error instanceof Error ? error.message : "unknown");
    return new Response("Card unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
