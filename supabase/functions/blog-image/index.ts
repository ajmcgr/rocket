import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_BLOG_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const TEXT_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const IMAGE_MODEL = Deno.env.get("GEMINI_BLOG_IMAGE_MODEL") || "gemini-2.5-flash-image";
const BUCKET = "blog-images";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = /^https?:\/\/(localhost:\d+|.*\.lovable\.app|(www\.)?tryrocket\.ai)$/.test(origin)
    ? origin
    : "https://tryrocket.ai";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- Gemini calls ------------------------------ */

const STYLE = [
  "Flat vector illustration in the style of a modern logo mark.",
  "Simple bold geometric shapes, clean crisp edges, solid flat fills only.",
  "Strictly limited palette: Rocket blue #1676E3, warm coral #F2683C, near-black #0A0A0A,",
  "on a plain light background (#FFFFFF or #F5F7FA). No other colours.",
  "Absolutely no gradients, no glow, no 3D, no shading, no textures, no photorealism,",
  "no dark moody backgrounds, no smoke, no light rays, no particles.",
  "One single centred symbol or minimal shape arrangement with generous negative space.",
  "Wide 16:9 landscape composition, centred subject, lots of flat empty background.",
  "Strictly no text, no letters, no numbers, no watermarks, no UI screenshots,",
  "no clipart, no people, no robots, no generic AI tropes.",
].join(" ");

async function geminiFetch(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const delays = [800, 2500, 6000];
  let lastError = "unknown error";
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return res;
      lastError = `${res.status}: ${(await res.text()).slice(0, 400)}`;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  throw new Error(`Gemini failed — ${lastError}`);
}

async function buildPrompt(article: {
  title: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
}): Promise<string> {
  const source = [
    `Title: ${article.title}`,
    `Category: ${article.category}`,
    `Tags: ${article.tags.join(", ")}`,
    `Excerpt: ${article.excerpt}`,
    `Article: ${article.body.replace(/\s+/g, " ").slice(0, 6000)}`,
  ].join("\n");

  try {
    const res = await geminiFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        systemInstruction: {
          parts: [{
            text:
              "You are a logo designer for a premium startup branding publication. " +
              "Read the article and write ONE image prompt (max 40 words) describing a SIMPLE, " +
              "flat vector symbol that acts as a visual metaphor for the article's core idea — " +
              "the kind of minimal geometric mark you'd see in a logo. Describe only the shape and " +
              "its arrangement. Never mention gradients, lighting, materials, 3D, textures, colours, " +
              "text, letters, people, robots or screenshots. Output the prompt only.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: source }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
      },
      20_000,
    );
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p?.text || "")
      .join("")
      .trim();
    if (text) return `${text} ${STYLE}`;
  } catch (error) {
    console.warn("prompt generation failed, using fallback", error);
  }

  return `A simple flat geometric symbol representing "${article.title}" in the field of ${article.category}. ${STYLE}`;
}

async function geminiImage(prompt: string): Promise<Uint8Array> {
  const res = await geminiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    },
    60_000,
  );
  const data = await res.json();
  for (const part of data?.candidates?.[0]?.content?.parts || []) {
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) continue;
    const binary = atob(inline.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error("Gemini returned no image");
}

/* ------------------------------ image pipeline ----------------------------- */

function cropToRatio(image: Image, ratio: number): Image {
  const current = image.width / image.height;
  if (Math.abs(current - ratio) < 0.01) return image.clone();
  if (current > ratio) {
    const width = Math.round(image.height * ratio);
    return image.clone().crop(Math.round((image.width - width) / 2), 0, width, image.height);
  }
  const height = Math.round(image.width / ratio);
  return image.clone().crop(0, Math.round((image.height - height) / 2), image.width, height);
}

async function derive(source: Image, ratio: number, width: number, quality: number) {
  const variant = cropToRatio(source, ratio).resize(width, Image.RESIZE_AUTO);
  return await variant.encodeJPEG(quality);
}

/* ---------------------------------- handler -------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!GEMINI_API_KEY) return json(req, { error: "GEMINI_API_KEY not configured" }, 500);

  let payload: {
    slug?: string;
    title?: string;
    excerpt?: string;
    body?: string;
    category?: string;
    tags?: string[];
    date?: string;
    force?: boolean;
  };
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const slug = (payload.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug || !payload.title) return json(req, { error: "slug and title are required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: existing } = await admin
    .from("blog_images")
    .select("slug, hero_url, card_url, og_url, prompt")
    .eq("slug", slug)
    .maybeSingle();

  if (existing && !payload.force) return json(req, { cached: true, image: existing });

  const article = {
    title: payload.title,
    excerpt: payload.excerpt || "",
    body: payload.body || "",
    category: payload.category || "Branding",
    tags: payload.tags || [],
  };

  let prompt = "";
  let raw: Uint8Array;
  try {
    prompt = await buildPrompt(article);
    raw = await geminiImage(prompt);
  } catch (error) {
    console.error(`blog-image failed for ${slug}:`, error);
    return json(req, { error: error instanceof Error ? error.message : "generation failed" }, 502);
  }

  const source = await Image.decode(raw);
  const stamp = new Date(payload.date && !Number.isNaN(+new Date(payload.date)) ? payload.date : Date.now());
  const folder = `${stamp.getUTCFullYear()}/${String(stamp.getUTCMonth() + 1).padStart(2, "0")}/${slug}`;

  const variants: { name: string; bytes: Uint8Array }[] = [
    { name: "hero.jpg", bytes: await derive(source, 16 / 9, 1600, 88) },
    { name: "card.jpg", bytes: await derive(source, 3 / 2, 900, 82) },
    { name: "og.jpg", bytes: await derive(source, 1200 / 630, 1200, 86) },
  ];

  const urls: Record<string, string> = {};
  for (const variant of variants) {
    const path = `${folder}/${variant.name}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, variant.bytes, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) {
      console.error("upload failed", path, error.message);
      return json(req, { error: `upload failed: ${error.message}` }, 500);
    }
    urls[variant.name] = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const row = {
    slug,
    hero_url: urls["hero.jpg"],
    card_url: urls["card.jpg"],
    og_url: urls["og.jpg"],
    prompt,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await admin.from("blog_images").upsert(row, { onConflict: "slug" });
  if (upsertError) {
    console.error("blog_images upsert failed", upsertError.message);
    return json(req, { error: upsertError.message }, 500);
  }

  return json(req, { cached: false, image: row });
});
