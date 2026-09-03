import { createClient } from "npm:@supabase/supabase-js@2.45.0";

// This function is also deployed from the Supabase dashboard, which only
// uploads index.ts. Keep its runtime helpers here instead of importing
// sibling _shared files.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") || "gpt-image-2";

type AssetType =
  | "logo" | "brand_guidelines" | "color_system" | "font_system" | "brand_voice"
  | "graphic" | "icon" | "photo" | "template" | "launch_copy"
  | "product_hunt_copy" | "social_post" | "founder_bio" | "presentation" | "other";

const ASSET_TITLES: Record<AssetType, string> = {
  logo: "Logo", brand_guidelines: "Brand Guidelines", color_system: "Color System",
  font_system: "Font System", brand_voice: "Brand Voice", graphic: "Graphic",
  icon: "Icon", photo: "Photo", template: "Template", launch_copy: "Launch Copy",
  product_hunt_copy: "Product Hunt Copy", social_post: "Social Post",
  founder_bio: "Founder Bio", presentation: "Presentation", other: "Asset",
};

const IMAGE_TYPES = new Set<AssetType>(["logo", "graphic", "icon", "photo"]);
const JSON_TYPES = new Set<AssetType>([
  "brand_guidelines", "color_system", "font_system", "brand_voice", "template",
  "launch_copy", "product_hunt_copy", "social_post", "founder_bio", "presentation",
]);
const ROCKET_PERSONA = "You are Rocket — an AI branding system for startups. You only create startup branding assets. Return only the requested asset, with no preamble.";

class GeminiUnavailableError extends Error {}
class ImageProviderUnavailableError extends Error {}

function cors(req: Request): Record<string, string> {
  const origins = ["https://tryrocket.ai", "https://www.tryrocket.ai", "http://localhost:5173", "http://localhost:3000"];
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function hasGeminiKey(): boolean {
  return Boolean(GEMINI_API_KEY);
}

async function geminiRequest(model: string, body: unknown): Promise<any> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal },
    );
    if (!response.ok) {
      const detail = await response.text();
      if ([429, 500, 502, 503, 504].includes(response.status)) throw new GeminiUnavailableError(`Gemini ${response.status}: ${detail}`);
      throw new Error(`Gemini ${response.status}: ${detail}`);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof GeminiUnavailableError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new GeminiUnavailableError("Gemini request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function geminiText(opts: { system: string; user: string; temperature?: number; json?: boolean }): Promise<string> {
  const data = await geminiRequest(GEMINI_MODEL, {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: 16384,
      ...(opts.json ? { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  return (data?.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || "").join("").trim();
}

async function generateImage(prompt: string): Promise<Uint8Array> {
  if (OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: "1024x1024", output_format: "png" }),
      });
      const data = await response.json();
      if (response.ok && data?.data?.[0]?.b64_json) return Uint8Array.from(atob(data.data[0].b64_json), (char) => char.charCodeAt(0));
    } catch (error) {
      console.warn("OpenAI image generation failed; using Gemini fallback", error);
    }
  }
  try {
    const data = await geminiRequest(GEMINI_IMAGE_MODEL, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    });
    const inline = (data?.candidates?.[0]?.content?.parts || []).find((part: any) => part?.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error("no image in Gemini response");
    return Uint8Array.from(atob(inline.data), (char) => char.charCodeAt(0));
  } catch (error) {
    throw new ImageProviderUnavailableError(error instanceof Error ? error.message : "Image generation unavailable");
  }
}

function buildPrompt(assetType: AssetType, context: Record<string, unknown>, instruction: string): string {
  const contextText = JSON.stringify(context, null, 2);
  if (assetType === "logo") return `Brand context:\n${contextText}\n\nRequest: ${instruction}\n\nWrite one precise image-generation prompt for a distinctive, flat vector startup logo. No text, slogans, mockups, gradients, or clipart. Use the existing brand cues when available.`;
  if (assetType === "icon") return `Brand context:\n${contextText}\n\nRequest: ${instruction}\n\nWrite one precise image-generation prompt for a clean, flat vector icon. No text.`;
  if (assetType === "photo") return `Brand context:\n${contextText}\n\nRequest: ${instruction}\n\nWrite one precise image-generation prompt for an on-brand, professional photograph.`;
  if (assetType === "graphic") return `Brand context:\n${contextText}\n\nRequest: ${instruction}\n\nWrite one precise image-generation prompt for an on-brand startup marketing graphic. No unreadable text or UI screenshot.`;
  return `Brand context:\n${contextText}\n\nRequest: ${instruction}\n\nCreate a complete, practical ${ASSET_TITLES[assetType]} for this brand. ${JSON_TYPES.has(assetType) ? "Return strict JSON only." : "Return only the requested asset."}`;
}

const GENERATORS: Record<AssetType, { kind: "image" | "text"; system: string; json?: boolean; build: (context: Record<string, unknown>, instruction: string) => string }> = Object.fromEntries(
  Object.keys(ASSET_TITLES).map((type) => [type, {
    kind: IMAGE_TYPES.has(type as AssetType) ? "image" : "text",
    system: ROCKET_PERSONA,
    json: JSON_TYPES.has(type as AssetType),
    build: (context, instruction) => buildPrompt(type as AssetType, context, instruction),
  }]),
) as Record<AssetType, { kind: "image" | "text"; system: string; json?: boolean; build: (context: Record<string, unknown>, instruction: string) => string }>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const ch = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: ch });
  let releaseReservation: (() => Promise<void>) | null = null;
  try {
    if (!hasGeminiKey()) return new Response(JSON.stringify({ error: "missing_environment_variable", variable: "GEMINI_API_KEY" }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });

    const { asset_id, instruction } = await req.json();
    if (!asset_id) return new Response(JSON.stringify({ error: "asset_id required" }), { status: 400, headers: { ...ch, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: asset } = await admin.from("assets").select("*").eq("id", asset_id).maybeSingle();
    if (!asset) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...ch, "Content-Type": "application/json" } });
    if (asset.user_id !== user.id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...ch, "Content-Type": "application/json" } });

    const at = asset.asset_type as AssetType;
    const spec = GENERATORS[at] || GENERATORS.other;
    const ctx = (asset.meta?.brand_context) || {};
    const userPrompt = instruction || asset.prompt || `Regenerate this ${ASSET_TITLES[at]}`;

    const cost = spec.kind === "image" ? 10 : 1;
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_generation_credits", { p_user_id: user.id, p_credits: cost });
    if (reserveError) throw reserveError;
    if (!reserved) return new Response(JSON.stringify({ error: "no_credits", code: "no_credits", needed: cost }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    let reservationOpen = true;
    releaseReservation = async () => {
      if (!reservationOpen) return;
      reservationOpen = false;
      const { error } = await admin.rpc("release_generation_credits", { p_user_id: user.id, p_credits: cost });
      if (error) console.error("credit release failed", error);
    };

    try {
      if (spec.kind === "image") {
        const imgPrompt = await geminiText({ system: spec.system, user: spec.build(ctx, userPrompt), temperature: 0.9 });
        const png = await generateImage(imgPrompt);
        const path = `${user.id}/${Date.now()}-regen.png`;
        await admin.storage.from("rocket-images").upload(path, png, { contentType: "image/png", upsert: false });
        const { data: pub } = admin.storage.from("rocket-images").getPublicUrl(path);
        await admin.from("assets").update({ image_url: pub.publicUrl, thumbnail_url: pub.publicUrl, meta: { ...(asset.meta || {}), image_prompt: imgPrompt } }).eq("id", asset_id);
        reservationOpen = false;
        return new Response(JSON.stringify({ image_url: pub.publicUrl, credits_charged: cost }), { headers: { ...ch, "Content-Type": "application/json" } });
      } else {
        const content = await geminiText({ system: spec.system, user: spec.build(ctx, userPrompt), temperature: 0.8, json: !!spec.json });
        await admin.from("assets").update({ content }).eq("id", asset_id);
        reservationOpen = false;
        return new Response(JSON.stringify({ content, credits_charged: cost }), { headers: { ...ch, "Content-Type": "application/json" } });
      }
    } catch (e) {
      if (e instanceof GeminiUnavailableError || e instanceof ImageProviderUnavailableError) {
        await releaseReservation();
        return new Response(JSON.stringify({ error: "ai_provider_unavailable", message: "Rocket is busy right now. Please try again in a moment." }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
      }
      throw e;
    }
  } catch (e) {
    await releaseReservation?.();
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
  }
});
