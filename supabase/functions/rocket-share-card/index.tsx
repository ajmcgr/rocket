import { loadPublicShareMetrics, loadPublicShareMetricsForApps, type ShareMetric } from "../_shared/publicShareMetrics.ts";
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

type Card = { title: string; detail: string; kicker: string; url: string; logo: string | null; cover: string | null; logos?: string[]; recapMetrics?: { label: string; value: string; source?: string }[] };
const recapImageCache = new Map<string, { bytes: Uint8Array; until: number }>();

function truncateForCard(value: string, limit: number) {
  if (value.length <= limit) return value;
  const prefix = value.slice(0, limit - 1).trimEnd();
  const boundary = prefix.lastIndexOf(" ");
  return `${(boundary > limit * 0.65 && !/\s/.test(value[limit - 1]) ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
}

async function loadCard(kind: string, id: string, includeCover: boolean): Promise<Card | null> {
  if (kind === "recap") {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return null;
    const { data, error } = await db.rpc("get_public_rocket_recap", { p_id: id });
    if (error || !data?.snapshot || !data?.username) return null;
    const month = new Date(`${data.snapshot.month}T00:00:00Z`).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" });
    if (month === "Invalid Date") return null;
    const app = data.snapshot.app;
    const metrics = Object.entries(data.snapshot.metrics || {}).filter(([key, value]) =>
      ["views", "clicks"].includes(key) && typeof value === "number" && Number.isFinite(value) && value > 0
    ).map(([key, value]) => ({ label: key === "views" ? "Recorded app visits" : "Website clicks", value: Number(value).toLocaleString("en") }));
    if (!metrics.length) return null;
    return { title: app?.name || `@${data.username}`, detail: `${month} on Rocket`, kicker: "ROCKET RECAP",
      url: `tryrocket.ai/recap/s/${id}`, logo: await rasterDataUrl(app?.logo_url || data.avatar_url), cover: null, recapMetrics: metrics };
  }
  if (kind === "rocket100") {
    if (!/^[a-z0-9_]{2,30}$/.test(id)) return null;
    const { data: cohort, error } = await db.rpc("get_rocket100_leaderboard");
    if (error || !Array.isArray(cohort?.rows)) return null;
    const builder = cohort.rows.find((row: { username: string }) => row.username === id);
    if (!builder) return null;
    const memberNumber = String(builder.founding_number).padStart(3, "0");
    return { title: builder.name || `@${id}`, detail: `@${id}  ·  Rocket 100 member #${memberNumber}${builder.rank ? `  ·  Current rank #${builder.rank}` : ""}`,
      kicker: "ROCKET 100", url: `tryrocket.ai/@${id}`, logo: await rasterDataUrl(builder.avatar_url), cover: null };
  }
  if (kind === "app") {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
    if (!isUuid && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return null;
    const { data: app, error } = await db.from("public_apps").select("id,slug,name,tagline,description,logo_url,categories").eq(isUuid ? "id" : "slug", id).maybeSingle();
    if (error || !app) return null;
    const { data: media } = includeCover ? await db.from("public_app_media_covers").select("source_url").eq("app_id", app.id).limit(1) : { data: null };
    const [logo, cover] = await Promise.all([rasterDataUrl(app.logo_url), includeCover ? rasterDataUrl(media?.[0]?.source_url) : Promise.resolve(null)]);
    const metrics = await loadPublicShareMetrics(db,app.id);
    const {data:developer} = metrics.length ? await db.rpc("get_app_developer",{p_app_id:app.id}) : {data:null};
    if (metrics.length) return {title:app.name.slice(0,120),detail:developer?.username ? `By @${developer.username}` : "Verified app traction",
      kicker:"VERIFIED TRACTION",url:`tryrocket.ai/apps/${app.slug || app.id}`,logo,cover:null,recapMetrics:metrics};
    return { title: app.name.slice(0, 120), detail: (app.tagline || app.description || "Explore this app on Rocket").slice(0, 180), kicker: app.categories?.[0] || "App on Rocket", url: `tryrocket.ai/apps/${app.slug}`, logo, cover };
  }
  if (kind === "profile") {
    if (!/^[a-z0-9_]{2,30}$/.test(id)) return null;
    const { data: profile, error } = await db.from("member_public_profiles").select("username,bio,avatar_url").eq("username", id).maybeSingle();
    if (error || !profile) return null;
    const { data: apps } = await db.rpc("get_public_member_apps", { p_username: id, p_offset: 0 });
    const count = Array.isArray(apps) ? apps.length : 0;
    let featured: {name:string;metrics:ShareMetric[]} | null = null;
    const publicApps=Array.isArray(apps) ? apps : [];
    const publicMetrics=await loadPublicShareMetricsForApps(db,publicApps.map(app=>app.id));
    for (const app of publicApps) {
      const metrics = publicMetrics.get(app.id) || [];
      if (metrics.length && (!featured || !metrics[0].label.startsWith("Daily"))) featured={name:app.name,metrics};
      if (featured && !featured.metrics[0].label.startsWith("Daily")) break;
    }
    if (featured) return {title:`@${profile.username}`,detail:featured.name.slice(0,65),kicker:"VERIFIED APP TRACTION",url:`tryrocket.ai/@${profile.username}`,
      logo:await rasterDataUrl(profile.avatar_url),cover:null,recapMetrics:featured.metrics};
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
  if (card.recapMetrics) {
    const portrait = height > width;
    const square = height === width;
    const pad = portrait ? 76 : square ? 56 : 48;
    return <div style={{ display: "flex", flexDirection: "column", width, height, padding: pad, backgroundColor: "#0b1522", color: "white", fontFamily: "Inter" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><img src={rocketLogo} width={portrait ? 245 : square ? 190 : 165} height={portrait ? 85 : square ? 65 : 57} style={{ objectFit: "contain" }} /><span style={{ display: "flex", color: "#72c0ed", fontSize: portrait ? 27 : square ? 22 : 20, fontWeight: 700, letterSpacing: 2 }}>{card.kicker}</span></div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: portrait ? 210 : square ? 100 : 24 }}>
        <span style={{ display: "flex", color: "#72c0ed", fontSize: portrait ? 38 : square ? 29 : 24, fontWeight: 700 }}>{card.detail}</span>
        <div style={{ display: "flex", alignItems: "center", gap: portrait || square ? 30 : 20, marginTop: portrait || square ? 22 : 12 }}>
          {card.logo && <img src={card.logo} width={portrait ? 150 : square ? 110 : 80} height={portrait ? 150 : square ? 110 : 80} style={{ borderRadius: 28, objectFit: "contain" }} />}
          <span style={{ display: "flex", maxWidth: portrait ? 800 : square ? 820 : 930, overflow: "hidden", fontSize: portrait ? 86 : square ? 80 : 64, fontWeight: 700, letterSpacing: -3, lineHeight: 1.08 }}>{truncateForCard(card.title, portrait ? 42 : 38)}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 38 : 28, marginTop: portrait ? 135 : square ? 95 : 26 }}>
        {card.recapMetrics.map((metric) => <div key={metric.label} style={{ display: "flex", flexDirection: "column", flex: 1, padding: portrait ? 42 : square ? 28 : 22, borderRadius: 25, border: "2px solid #31536b", backgroundColor: "#132638" }}><span style={{ display: "flex", color: "white", fontSize: metric.value.length>18 ? (portrait?56:square?40:32) : metric.value.length>12 ? (portrait?72:square?60:48) : portrait ? 112 : square ? 92 : 64, fontWeight: 700 }}>{metric.value}</span><span style={{ display: "flex", color: "#bdd0dd", fontSize: portrait ? 30 : square ? 24 : 21 }}>{metric.label}</span>{metric.source && <span style={{display:"flex",color:"#9bb8ca",fontSize:portrait?23:square?18:16,marginTop:portrait||square?10:6}}>{metric.source}</span>}</div>)}
      </div>
      <div style={{ display: "flex", marginTop: "auto", paddingTop: 24, borderTop: "2px solid #31536b", justifyContent: "space-between", color: "#bdd0dd", fontSize: portrait ? 28 : 20 }}><span>The open app platform for builders.</span><span style={{ color: "#72c0ed" }}>{card.url}</span></div>
    </div>;
  }
  const portrait = height > width;
  const square = height === width;
  const pad = portrait ? 72 : square ? 64 : 48;
  const visualWidth = portrait ? 936 : square ? 952 : 636;
  const visualHeight = portrait ? 770 : square ? 570 : 410;
  const coverZoom = square ? 1.27 : 1.48;
  const logoSize = portrait ? 144 : square ? 112 : 104;
  const titleLimit = portrait ? 56 : square ? 52 : 37;
  const visibleTitle = truncateForCard(card.title, titleLimit);
  const detailLimit = portrait ? 135 : square ? 105 : 55;
  const visibleDetail = truncateForCard(card.detail, detailLimit);
  const visibleUrl = card.url.length > 65 ? `${card.url.slice(0, 47)}…` : card.url;
  const nameSize = portrait ? (visibleTitle.length > 20 ? 76 : 100) : square ? (visibleTitle.length > 22 ? 62 : 82) : visibleTitle.length > 35 ? 38 : visibleTitle.length > 18 ? 50 : 68;
  const visual = <div style={{ display: "flex", width: visualWidth, height: visualHeight, flexShrink: 0, alignItems: card.cover && !portrait ? "flex-start" : "center", justifyContent: "center", overflow: "hidden", borderRadius: portrait ? 42 : 28, backgroundColor: "#eef7fc", border: "2px solid #dcebf5" }}>
    {card.cover && !portrait ? <img src={card.cover} width={Math.round(visualWidth * coverZoom)} height={Math.round(visualHeight * coverZoom)} style={{ objectFit: "cover", objectPosition: "top", flexShrink: 0 }} /> : card.logos?.length ? <div style={{ display: "flex", gap: 24, alignItems: "center" }}>{card.logos.map((logo, index) => <img key={index} src={logo} width={portrait ? 190 : 130} height={portrait ? 190 : 130} style={{ borderRadius: 28, objectFit: "contain" }} />)}</div> : card.logo ? <img src={card.logo} width={portrait ? 390 : square ? 280 : 230} height={portrait ? 390 : square ? 280 : 230} style={{ borderRadius: portrait ? 80 : 50, objectFit: "contain" }} /> : <span style={{ display: "flex", fontSize: portrait ? 240 : 150, color: "#469DDA", fontWeight: 700 }}>{card.title.slice(0, 1).toUpperCase()}</span>}
  </div>;
  const identity = <div style={{ display: "flex", flexDirection: portrait ? "column" : "row", gap: portrait ? 32 : 24, alignItems: portrait ? "flex-start" : "center", width: portrait ? 936 : square ? 952 : 420 }}>
    {card.logo ? <img src={card.logo} width={logoSize} height={logoSize} style={{ borderRadius: portrait ? 32 : 24, objectFit: "contain", backgroundColor: "#f3f7fa" }} /> : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: logoSize, height: logoSize, borderRadius: 24, backgroundColor: "#dceffb", color: "#2389cb", fontSize: 65, fontWeight: 700 }}>{card.title.slice(0, 1).toUpperCase()}</div>}
    <div style={{ display: "flex", flexDirection: "column", width: portrait ? 936 : square ? 810 : 290 }}>
      <div style={{ display: "flex", fontSize: nameSize, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.03, maxHeight: portrait ? 260 : square ? 178 : 145, overflow: "hidden" }}>{visibleTitle}</div>
      <div style={{ display: "flex", marginTop: 12, color: "#536173", fontSize: portrait ? 36 : square ? 31 : visibleDetail.length > 52 ? 24 : 27, lineHeight: 1.25, maxHeight: portrait ? 180 : square ? 128 : 145, overflow: "hidden" }}>{visibleDetail}</div>
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
      <span>The open app platform for builders.</span><span style={{ color: "#2389cb", fontWeight: 700 }}>{visibleUrl}</span>
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
  if (!(variant in formats) || id.length > 120 || (version !== null && !/^[a-z0-9]{1,16}$/i.test(version)) || !["app", "profile", "collection", "rocket100", "recap"].includes(kind)) return notFound();
  if (!allowRender(req, `${kind}:${id}:${variant}`)) return new Response("Card request limit reached", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  try {
    const card = await loadCard(kind, id, variant !== "portrait");
    if (!card) return notFound();
    if (req.method === "HEAD") return new Response(null, { headers: { "Content-Type": "image/png", "Cache-Control": ["recap","app","profile"].includes(kind) ? "no-store" : "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
    if (kind === "recap") {
      const key = `${id}:${variant}`;
      const cached = recapImageCache.get(key);
      if (cached && cached.until > Date.now()) return new Response(cached.bytes.slice(), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" } });
    }
    const [width, height] = formats[variant as keyof typeof formats];
    const image = new ImageResponse(artwork(card, width, height), { width, height, fonts: cardFonts });
    const headers = new Headers(image.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", ["recap","app","profile"].includes(kind) ? "no-store" : kind === "collection" ? "public, max-age=30" : "public, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") return new Response(null, { headers });
    if (kind === "recap") {
      const bytes = new Uint8Array(await image.arrayBuffer());
      if (recapImageCache.size > 100) recapImageCache.delete(recapImageCache.keys().next().value!);
      recapImageCache.set(`${id}:${variant}`, { bytes, until: Date.now() + 300_000 });
      return new Response(bytes.slice(), { status: 200, headers });
    }
    return new Response(image.body, { status: image.status, headers });
  } catch (error) {
    console.error("share card render failed", error instanceof Error ? error.message : "unknown");
    return new Response("Card unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
