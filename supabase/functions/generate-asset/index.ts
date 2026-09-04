// redeploy: 2026-07-01
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
// Lovable deploys a single index.ts file. These production helpers are kept
// inline so dashboard deployments do not depend on sibling _shared modules.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const configuredImageModel = Deno.env.get("GEMINI_IMAGE_MODEL")?.trim();
const GEMINI_IMAGE_MODEL =
  !configuredImageModel || configuredImageModel === "gemini-2.5-flash-image-preview"
    ? "gemini-2.5-flash-image"
    : configuredImageModel;

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const RETRY_DELAYS_MS = [800, 2000, 5000];
const GEMINI_IMAGE_TIMEOUT_MS = 40_000;

type GeminiFetchOptions = {
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
};

function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}

class GeminiUnavailableError extends Error {
  status: number;
  bodyText: string;

  constructor(status: number, bodyText: string) {
    super(`Gemini ${status}: ${bodyText}`);
    this.name = "GeminiUnavailableError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.includes(status);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function gFetch(
  url: string,
  init: RequestInit,
  { timeoutMs, retryDelaysMs = RETRY_DELAYS_MS }: GeminiFetchOptions = {},
): Promise<Response> {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    const controller = timeoutMs ? new AbortController() : undefined;
    const timeout = timeoutMs
      ? setTimeout(() => controller?.abort(), timeoutMs)
      : undefined;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller?.signal ?? init.signal,
      });
      if (response.ok) return response;

      lastStatus = response.status;
      lastBody = await response.text();

      if (!isRetryableStatus(response.status) || attempt === retryDelaysMs.length) {
        break;
      }
    } catch (error) {
      lastStatus = controller?.signal.aborted ? 504 : 0;
      lastBody = controller?.signal.aborted
        ? `Gemini request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);

      if (attempt === retryDelaysMs.length) {
        throw new GeminiUnavailableError(lastStatus, lastBody);
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    await sleep(retryDelaysMs[attempt]);
  }

  if (isRetryableStatus(lastStatus)) {
    throw new GeminiUnavailableError(lastStatus, lastBody);
  }

  throw new Error(`Gemini ${lastStatus}: ${lastBody}`);
}

async function callGeminiText(userText: string, opts: { system: string; temperature?: number; json?: boolean; maxTokens: number }): Promise<{ text: string; finishReason?: string }> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens,
    },
  };

  if (opts.json) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
    (body.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await gFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part: { text?: string }) => part?.text || "")
    .join("")
    .trim();

  return { text, finishReason: candidate?.finishReason };
}

function stripJsonFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : text).trim();
}

function repairJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let out = "";
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];
    out += char;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
        stack.pop();
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      stack.push("\"");
      continue;
    }

    if (char === "{" || char === "[") stack.push(char);
    if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
    if (char === "]" && stack[stack.length - 1] === "[") stack.pop();
  }

  if (inString) {
    out += "\"";
    if (stack[stack.length - 1] === "\"") stack.pop();
  }

  out = out.replace(/,\s*$/, "").replace(/:\s*$/, ": null").replace(/,\s*([\]}])/g, "$1");

  while (stack.length) {
    const top = stack.pop();
    if (top === "{") out += "}";
    if (top === "[") out += "]";
  }

  return out;
}

async function geminiText(opts: { system: string; user: string; temperature?: number; json?: boolean }): Promise<string> {
  if (!opts.json) {
    const result = await callGeminiText(opts.user, {
      system: opts.system,
      temperature: opts.temperature,
      maxTokens: 16384,
    });
    return result.text;
  }

  let lastText = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await callGeminiText(
      attempt === 0
        ? opts.user
        : `${opts.user}\n\nCRITICAL: Return ONLY one complete, valid JSON object. No markdown. No preamble. No trailing text.`,
      {
        system: opts.system,
        temperature: opts.temperature,
        json: true,
        maxTokens: attempt === 0 ? 32768 : 65536,
      },
    );

    lastText = result.text;
    if (!lastText) continue;

    const stripped = stripJsonFence(lastText);
    try {
      JSON.parse(stripped);
      return stripped;
    } catch {
      const repaired = repairJson(stripped);
      if (!repaired) continue;
      try {
        JSON.parse(repaired);
        return repaired;
      } catch {
        continue;
      }
    }
  }

  return lastText;
}

async function geminiImage(
  prompt: string,
  referenceImages?: { mimeType: string; data: string }[],
): Promise<Uint8Array> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const image of referenceImages || []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  const response = await gFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    },
    { timeoutMs: GEMINI_IMAGE_TIMEOUT_MS, retryDelaysMs: [] },
  );

  const data = await response.json();
  const candidateParts = data?.candidates?.[0]?.content?.parts || [];

  for (const part of candidateParts) {
    const inline = part?.inlineData || part?.inline_data;
    if (!inline?.data) continue;

    const binary = atob(inline.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  throw new Error("no image in Gemini response");
}

const ALLOWED_ORIGINS = [
  "https://tryrocket.ai",
  "https://www.tryrocket.ai",
  "http://localhost:5173",
  "http://localhost:3000",
];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}


const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_IMAGE_MODEL =
  Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() || "gpt-image-2";
const OPENAI_TIMEOUT_MS = 30_000;

type ReferenceImage = {
  mimeType: string;
  data: string;
};

class ImageProviderUnavailableError extends Error {
  provider: string;
  status: number;
  bodyText: string;

  constructor(provider: string, status: number, bodyText: string) {
    super(`${provider} image generation is unavailable`);
    this.name = "ImageProviderUnavailableError";
    this.provider = provider;
    this.status = status;
    this.bodyText = bodyText;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readOpenAIImage(response: Response): Promise<Uint8Array> {
  const bodyText = await response.text();

  if (!response.ok) {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      response.status,
      bodyText.slice(0, 1000),
    );
  }

  let payload: {
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      502,
      "OpenAI returned invalid JSON",
    );
  }

  const image = payload.data?.[0];
  if (image?.b64_json) return decodeBase64(image.b64_json);

  if (image?.url) {
    const imageResponse = await fetchWithTimeout(image.url, {
      method: "GET",
    });
    if (!imageResponse.ok) {
      throw new ImageProviderUnavailableError(
        "OpenAI",
        imageResponse.status,
        "OpenAI image download failed",
      );
    }
    return new Uint8Array(await imageResponse.arrayBuffer());
  }

  throw new ImageProviderUnavailableError(
    "OpenAI",
    502,
    "OpenAI returned no image",
  );
}

async function openAIImage(
  prompt: string,
  referenceImages: ReferenceImage[],
): Promise<Uint8Array> {
  if (!OPENAI_API_KEY) {
    throw new ImageProviderUnavailableError(
      "OpenAI",
      503,
      "OPENAI_API_KEY not configured",
    );
  }

  const authorization = `Bearer ${OPENAI_API_KEY}`;

  if (referenceImages.length === 0) {
    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt,
          size: "1024x1024",
          output_format: "png",
        }),
      },
    );

    return await readOpenAIImage(response);
  }

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("output_format", "png");

  for (const [index, referenceImage] of referenceImages.entries()) {
    form.append(
      "image[]",
      new Blob([decodeBase64(referenceImage.data)], {
        type: referenceImage.mimeType,
      }),
      `reference-${index + 1}.png`,
    );
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/images/edits",
    {
      method: "POST",
      headers: { Authorization: authorization },
      body: form,
    },
  );

  return await readOpenAIImage(response);
}

async function generateImage(
  prompt: string,
  referenceImages: ReferenceImage[] = [],
): Promise<Uint8Array> {
  if (OPENAI_API_KEY) {
    try {
      return await openAIImage(prompt, referenceImages);
    } catch (error) {
      const status = error instanceof ImageProviderUnavailableError
        ? error.status
        : 503;
      console.warn(
        `OpenAI image generation failed (${status}); using Gemini fallback`,
      );
    }
  }

  try {
    return await geminiImage(prompt, referenceImages);
  } catch (error) {
    if (error instanceof GeminiUnavailableError) {
      throw new ImageProviderUnavailableError(
        "Gemini",
        error.status,
        error.bodyText,
      );
    }

    throw new ImageProviderUnavailableError(
      "Gemini",
      503,
      error instanceof Error ? error.message : "Gemini image generation failed",
    );
  }
}


// Specialized branding generators. Each asset_type has its own prompt.
// Rocket behaves like a branding specialist, not a general assistant.

type AssetType =
  | "logo" | "brand_guidelines" | "color_system" | "font_system" | "brand_voice"
  | "graphic" | "icon" | "photo" | "template"
  | "launch_copy" | "product_hunt_copy" | "social_post" | "founder_bio"
  | "presentation" | "other";

const IMAGE_ASSET_TYPES = new Set<AssetType>(["logo", "graphic", "icon", "photo"]);

const ASSET_TITLES: Record<AssetType, string> = {
  logo: "Logo", brand_guidelines: "Brand Guidelines", color_system: "Color System",
  font_system: "Font System", brand_voice: "Brand Voice", graphic: "Graphic",
  icon: "Icon", photo: "Photo", template: "Template", launch_copy: "Launch Copy",
  product_hunt_copy: "Product Hunt Copy", social_post: "Social Post",
  founder_bio: "Founder Bio", presentation: "Presentation", other: "Asset",
};

const ROCKET_PERSONA =
  "You are Rocket — an AI branding system for startups. You ONLY create startup branding assets: logos, brand systems, colors, typography, launch assets, startup positioning, marketing graphics. You never behave like a general chatbot. If a request is outside branding, politely redirect. Output ONLY the requested asset, no preamble.";

interface BrandContext {
  productName?: string; url?: string; tagline?: string; industry?: string;
  audience?: string; tone?: string; colors?: string[]; fonts?: string[];
  description?: string; competitors?: string[]; logo?: string; favicon?: string;
  ogImage?: string; colorScheme?: string; screenshot?: string;
  // Brand Intelligence Layer (from scrape-url + Gemini analysis)
  category?: string; product?: string; targetCustomer?: string;
  audienceSegments?: string[]; positioning?: string; keywords?: string[];
  valueProps?: string[]; voice?: { tone?: string; traits?: string[]; notToBe?: string[] };
  selected_direction?: {
    id?: string; title?: string; asset_type?: string; image_url?: string; prompt?: string;
  };
}

function ctxBlock(c: BrandContext, userPrompt: string): string {
  const lines: string[] = [];
  if (c.productName) lines.push(`Product: ${c.productName}`);
  if (c.url) lines.push(`URL: ${c.url}`);
  if (c.tagline) lines.push(`Tagline: ${c.tagline}`);
  if (c.industry) lines.push(`Industry: ${c.industry}`);
  if (c.category) lines.push(`Category: ${c.category}`);
  if (c.product) lines.push(`What it does: ${c.product}`);
  if (c.positioning) lines.push(`Positioning: ${c.positioning}`);
  if (c.targetCustomer) lines.push(`Target customer: ${c.targetCustomer}`);
  if (c.audienceSegments?.length) lines.push(`Audience segments: ${c.audienceSegments.join(", ")}`);
  if (c.audience) lines.push(`Audience: ${c.audience}`);
  if (c.tone) lines.push(`Tone: ${c.tone}`);
  if (c.voice?.tone) lines.push(`Voice tone: ${c.voice.tone}`);
  if (c.voice?.traits?.length) lines.push(`Voice traits: ${c.voice.traits.join(", ")}`);
  if (c.voice?.notToBe?.length) lines.push(`Voice — not to be: ${c.voice.notToBe.join(", ")}`);
  if (c.valueProps?.length) lines.push(`Value props: ${c.valueProps.join(" | ")}`);
  if (c.keywords?.length) lines.push(`Keywords: ${c.keywords.join(", ")}`);
  if (c.description) lines.push(`Description: ${c.description}`);
  if (c.colors?.length) lines.push(`Brand colors: ${c.colors.join(", ")}`);
  if (c.fonts?.length) lines.push(`Brand fonts: ${c.fonts.join(", ")}`);
  if (c.colorScheme) lines.push(`Color scheme: ${c.colorScheme}`);
  if (c.logo) lines.push(`Existing logo URL (reference only): ${c.logo}`);
  if (c.favicon) lines.push(`Existing favicon URL (reference only): ${c.favicon}`);
  if (c.ogImage) lines.push(`OG image URL (reference only): ${c.ogImage}`);
  if (c.screenshot) lines.push(`Homepage screenshot URL (reference only): ${c.screenshot}`);
  if (c.selected_direction?.title) {
    lines.push(`Selected brand direction: ${c.selected_direction.title}${c.selected_direction.asset_type ? ` (${c.selected_direction.asset_type})` : ""}`);
  }
  if (c.selected_direction?.prompt) lines.push(`Selected direction brief: ${c.selected_direction.prompt.slice(0, 500)}`);
  if (c.competitors?.length) lines.push(`Competitors: ${c.competitors.join(", ")}`);
  lines.push("");
  lines.push(`User request: ${userPrompt}`);
  if (c.colors?.length || c.productName || c.logo || c.screenshot || c.selected_direction) {
    lines.push("");
    lines.push("CRITICAL: This is a REAL existing brand. Your job is to EVOLVE its existing identity, not invent a new one. Stay faithful to the scraped colors, fonts, logo motif, and visual language above. When a selected brand direction is present, treat it as the approved source of truth: preserve its distinctive visual choices and tone while creating a new original design. Do not invent unrelated colors, names, motifs, or vibes. Reference images may also be attached — match their style.");
  }
  return lines.join("\n");
}

interface GenSpec {
  kind: "image" | "text";
  system: string;
  build: (c: BrandContext, userPrompt: string) => string;
  defaultCount?: number;
  json?: boolean;
}

const GENERATORS: Record<AssetType, GenSpec> = {
  logo: {
    kind: "image", defaultCount: 24,
    system: ROCKET_PERSONA + " You specialize in iconic, scalable startup LOGO MARKS in the style of Linear, Vercel, Stripe, Notion, Framer and Cursor — never poster designs, never text canvases, never AI clipart, never illustrations.",
    build: (c, p) => {
      const hasRef = !!c.logo;
      return `${ctxBlock(c, p)}\n\nGenerate ONE distinct, production-ready logo concept for a modern startup. Output ONLY a text-to-image prompt (no JSON, no preamble) following these rules:\n${hasRef ? `- A REFERENCE LOGO image of this brand IS PROVIDED. Produce a CLOSE VARIATION: same core motif, same silhouette family, same palette, same overall style. Acceptable variations: alternate angle, monochrome, simplified, badge, refined geometry.\n` : `- An ICONIC, DISTINCTIVE mark or monogram — one clear idea, memorable at 16x16, geometrically constructed on a grid, balanced negative space, at most 2-3 shapes.\n`}- HARD BANS: no AI clipart, no illustrations, no cartoon characters, no gradients-on-gradients, no drop shadows, no 3D renders, no glossy plastic, no photorealism, no long text, no slogans, no taglines, no UI screenshots, no low-contrast pastel-on-white, no generic swooshes or ribbons, no globes/handshakes/lightbulbs cliches.\n- STYLE: flat vector, crisp geometry, thick consistent stroke weights, strong figure/ground contrast, scalable, favicon-ready — inspired by the visual language of Linear, Vercel, Stripe, Notion, Framer, Cursor, Arc.\n- COLOR: solid white background, 1-3 colors max${c.colors?.length ? `, use ONLY these exact brand colors: ${c.colors.slice(0,3).join(", ")}. Do not invent new colors.` : ", one confident primary color with high contrast against white."}${c.productName ? ` The mark must clearly belong to "${c.productName}" and reflect its category and positioning above.` : ""}\n- End with: ", minimalist vector logo mark, flat geometric design, precise construction, modern startup identity, centered on solid white background, generous padding, no text, no typography, no letters, no watermark, app-icon ready, ultra clean, high quality"`;
    },
  },
  graphic: {
    kind: "image", defaultCount: 24,
    system: ROCKET_PERSONA + " You design social graphics, hero banners, and marketing visuals.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nOutput ONLY a text-to-image prompt for a marketing graphic. Vivid; specify composition, mood, colors${c.colors?.length ? ` (use: ${c.colors.slice(0,4).join(", ")})` : ""}, style. End with ", modern startup marketing graphic, high quality, clean composition".`,
  },
  icon: {
    kind: "image", defaultCount: 24,
    system: ROCKET_PERSONA + " You design clean vector icons.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nOutput ONLY a text-to-image prompt for a single icon. Flat vector, geometric, 1-2 colors, centered on solid white background, app-icon ready, no text. End with ", vector icon, flat design, no text, high quality".`,
  },
  photo: {
    kind: "image", defaultCount: 24,
    system: ROCKET_PERSONA + " You produce on-brand product / lifestyle imagery.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nOutput ONLY a text-to-image prompt for one photograph. Photorealistic, cinematic lighting, on-brand. End with ", photorealistic, professional photography, high resolution".`,
  },
  color_system: {
    kind: "text", json: true, defaultCount: 24, system: ROCKET_PERSONA + " You design startup color systems.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nDesign a COMPLETE startup color system. Return strict JSON (no markdown, no preamble) with this exact shape:\n{\n  "name": "<palette name>",\n  "primary": "#RRGGBB",\n  "secondary": "#RRGGBB",\n  "accent": "#RRGGBB",\n  "success": "#RRGGBB",\n  "warning": "#RRGGBB",\n  "danger": "#RRGGBB",\n  "neutral_dark": "#RRGGBB",\n  "neutral_light": "#RRGGBB",\n  "neutrals": {\n    "50":  "#RRGGBB",\n    "100": "#RRGGBB",\n    "200": "#RRGGBB",\n    "300": "#RRGGBB",\n    "400": "#RRGGBB",\n    "500": "#RRGGBB",\n    "600": "#RRGGBB",\n    "700": "#RRGGBB",\n    "800": "#RRGGBB",\n    "900": "#RRGGBB"\n  },\n  "gradients": [\n    { "name": "<short name>", "from": "#RRGGBB", "to": "#RRGGBB", "angle": 135 },\n    { "name": "<short name>", "from": "#RRGGBB", "to": "#RRGGBB", "angle": 90 },\n    { "name": "<short name>", "from": "#RRGGBB", "to": "#RRGGBB", "angle": 45 }\n  ],\n  "light_mode": { "background": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "muted_text": "#RRGGBB", "border": "#RRGGBB" },\n  "dark_mode":  { "background": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "muted_text": "#RRGGBB", "border": "#RRGGBB" },\n  "accessibility": "<2-4 sentences on WCAG contrast ratios — call out which pairs pass AA/AAA and which to avoid>",\n  "usage": "<2-4 sentences on when to use primary vs secondary vs accent, and where to use success/warning/danger>",\n  "rationale": "<2-3 sentences on why this palette fits the brand>"\n}\nNeutrals must be a true 10-step scale from lightest (50) to darkest (900). Keep semantic colors (success/warning/danger) tasteful and on-brand, not generic stoplight green/yellow/red.`,
  },
  font_system: {
    kind: "text", json: true, defaultCount: 24, system: ROCKET_PERSONA + " You design startup typography systems.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nDesign a COMPLETE typography system. Return strict JSON (no markdown, no preamble):\n{\n  "display_font": "<Google Font name>",\n  "heading_font": "<Google Font name>",\n  "body_font": "<Google Font name>",\n  "mono_font": "<Google Font name>",\n  "display_weight": <number>,\n  "heading_weight": <number>,\n  "body_weight": <number>,\n  "scale": {\n    "h1":    { "size_px": 60, "line_height": 1.05, "weight": 700, "tracking": "-0.02em" },\n    "h2":    { "size_px": 48, "line_height": 1.1,  "weight": 700, "tracking": "-0.015em" },\n    "h3":    { "size_px": 36, "line_height": 1.15, "weight": 600, "tracking": "-0.01em" },\n    "h4":    { "size_px": 28, "line_height": 1.2,  "weight": 600, "tracking": "-0.005em" },\n    "h5":    { "size_px": 22, "line_height": 1.25, "weight": 600, "tracking": "0" },\n    "h6":    { "size_px": 18, "line_height": 1.3,  "weight": 600, "tracking": "0" },\n    "body":  { "size_px": 16, "line_height": 1.55, "weight": 400, "tracking": "0" },\n    "small": { "size_px": 13, "line_height": 1.45, "weight": 400, "tracking": "0" }\n  },\n  "pair_rationale": "<2-3 sentences on why these fonts pair well>",\n  "usage": "<2-3 sentences on where to use display vs heading vs body vs mono>",\n  "example_headline": "<a real on-brand example headline using the display font>",\n  "example_body": "<an on-brand 2-3 sentence body paragraph using the body font>"\n}\nUse Google Fonts. Avoid Inter and Poppins. Tune sizes to feel modern and confident — display headings should feel large.`,
  },
  brand_voice: {
    kind: "text", json: true, defaultCount: 24, system: ROCKET_PERSONA + " You define startup brand voices.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nDefine a Brand Voice. Return STRICT JSON ONLY (no markdown, no code fences, no preamble). Keep every field concise — 1-2 sentences max where prose is asked. Shape:\n{\n  "overview": "<2 sentences>",\n  "pillars": [ { "name": "<pillar>", "description": "<1-2 sentences>", "example": "<one short example sentence>" } ],\n  "tone_by_context": [\n    { "context": "Landing page", "guidance": "<1-2 sentences>" },\n    { "context": "Product UI",   "guidance": "<1-2 sentences>" },\n    { "context": "Social",       "guidance": "<1-2 sentences>" },\n    { "context": "Support",      "guidance": "<1-2 sentences>" }\n  ],\n  "do":   [ { "phrase": "<short>", "why": "<≤8 words>" } ],\n  "dont": [ { "phrase": "<short>", "why": "<≤8 words>" } ],\n  "website_examples": [ { "label": "Hero", "copy": "..." }, { "label": "Feature", "copy": "..." }, { "label": "CTA", "copy": "..." } ],\n  "social_examples":  [ { "platform": "X", "copy": "..." }, { "platform": "LinkedIn", "copy": "..." } ],\n  "launch_examples":  [ { "label": "Short",  "copy": "..." }, { "label": "Medium", "copy": "..." } ]\n}\nExactly 4 pillars, 6 dos, 6 don'ts. Use the real product name from the context.`,
  },
  brand_guidelines: {
    kind: "text", json: true, defaultCount: 24, system: ROCKET_PERSONA + " You write startup brand guideline docs.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nWrite COMPLETE agency-grade Brand Guidelines. Return STRICT JSON ONLY (no markdown, no preamble). Fill every field with substantive, on-brand copy — no placeholders, no skipped sections. Shape:\n{\n  "brand_name": "<brand>",\n  "overview":  "<3-5 sentences>",\n  "mission":   "<1 sentence + 2-3 sentence unpack>",\n  "vision":    "<1 sentence + 2-3 sentence unpack>",\n  "positioning": "For <audience>, <brand> is the <category> that <key benefit>, unlike <alternative>, we <differentiator>.",\n  "audience":  "<2-3 paragraphs>",\n  "personas":  [ { "name": "<name>", "role": "<role>", "demographics": "<...>", "goals": ["..."], "pains": ["..."], "triggers": ["..."], "channels": ["..."], "quote": "..." } ],\n  "personality_traits": [ { "trait": "<word>", "description": "<one line>" } ],\n  "values":             [ { "name": "<short phrase>", "description": "<one sentence>" } ],\n  "voice": { "overview": "<3-4 sentences>", "tone_shifts": [ { "context": "Landing",  "guidance": "..." }, { "context": "Product", "guidance": "..." }, { "context": "Social", "guidance": "..." }, { "context": "Support", "guidance": "..." } ] },\n  "messaging": { "core_message": "<paragraph>", "value_prop": "<sentence>", "pillars": [ { "name": "<pillar>", "proof": "<one line>" } ], "reasons_to_believe": ["..."] },\n  "taglines":     ["...","...","...","...","...","..."],\n  "elevator_pitch": { "one_sentence": "...", "thirty_second": "<3-4 sentences>", "two_minute": "<one short paragraph>" },\n  "do":   ["...","...","...","...","...","..."],\n  "dont": ["...","...","...","...","...","..."],\n  "website_examples": { "hero": { "headline": "...", "subheadline": "..." }, "feature": { "headline": "...", "body": "..." }, "cta": { "headline": "...", "body": "..." } },\n  "social_examples": [ { "platform": "X",        "copy": "..." }, { "platform": "LinkedIn", "copy": "..." }, { "platform": "Threads",  "copy": "..." } ],\n  "launch_examples": [ { "label": "Product Hunt short",  "copy": "..." }, { "label": "LinkedIn long",     "copy": "..." } ]\n}\nProvide exactly 3 personas, 5-6 personality traits, 4-5 values, 3 messaging pillars, 6 taglines, 6 dos, 6 don'ts.`,
  },
  launch_copy: {
    kind: "text", json: true, system: ROCKET_PERSONA + " You write founder-led launch copy.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble) for a complete launch copy package. Fill every field with real, on-brand, ready-to-ship copy:\n{\n  "tagline":             "<≤8 words>",\n  "one_liner":           "<1 sentence>",\n  "short_description":   "<1-2 sentences, ≤200 chars>",\n  "medium_description":  "<3-4 sentences>",\n  "long_description":    "<2-3 paragraphs as plain text, separated by \\n\\n>",\n  "hero": { "headline": "...", "subheadline": "<1-2 sentences>", "cta": "<≤4 words>" },\n  "cta_variations":      ["...","...","...","...","..."],\n  "launch_announcement": "<5-8 sentence founder-led post as plain text>",\n  "seo": { "title": "<≤60 chars>", "meta_description": "<≤155 chars>" }\n}`,
  },
  product_hunt_copy: {
    kind: "text", json: true, system: ROCKET_PERSONA + " You write Product Hunt launch copy.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble) for a complete Product Hunt launch package:\n{\n  "tagline":             "<≤60 chars>",\n  "short_description":   "<≤260 chars>",\n  "full_description":    "<3-4 short paragraphs as plain text, separated by \\n\\n>",\n  "first_comment":       "<5-8 sentence pinned first comment, ends with a question>",\n  "maker_comment":       "<3-5 sentence maker note>",\n  "launch_tweet":        "<single tweet, ≤270 chars>",\n  "faq":                 [ { "q": "...", "a": "..." } ],\n  "community_responses": [ { "scenario": "This looks like X", "reply": "..." }, { "scenario": "Is there a free tier?", "reply": "..." }, { "scenario": "Congrats / supportive", "reply": "..." } ],\n  "topics":              ["...","...","...","...","..."]\n}\nGive exactly 5 FAQ pairs and 3-5 topics.`,
  },
  social_post: {
    kind: "text", json: true, system: ROCKET_PERSONA + " You write founder-style social posts.",
    build: (c, p) => {
      const wantsLibrary = /\b(library|content library|50|forty|fifty|pack|series|month|calendar|all categories|founder posts|growth posts|educational posts)\b/i.test(p);
      if (!wantsLibrary) {
        return `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble):\n{ "kind": "post", "platform": "<X|LinkedIn|Reddit|Threads>", "copy": "<the post copy. Plain text. If a thread, number posts 1/, 2/, ...>" }`;
      }
      return `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble) for a complete founder social content library:\n{\n  "kind": "library",\n  "categories": [\n    { "name": "Launch",        "posts": [ { "platform": "X|LinkedIn", "copy": "..." } ] },\n    { "name": "Founder",       "posts": [ { "platform": "X|LinkedIn", "copy": "..." } ] },\n    { "name": "Educational",   "posts": [ { "platform": "X|LinkedIn", "copy": "..." } ] },\n    { "name": "Growth",        "posts": [ { "platform": "X|LinkedIn", "copy": "..." } ] },\n    { "name": "Announcement",  "posts": [ { "platform": "X|LinkedIn", "copy": "..." } ] },\n    { "name": "Threads",       "posts": [ { "platform": "X", "copy": "<numbered thread: 1/ ... 2/ ... 3/ ...>" } ] }\n  ]\n}\nProvide 10 Launch, 10 Founder, 10 Educational, 10 Growth, 5 Announcement, 5 Threads. Every post is real, specific, and immediately postable.`;
    },
  },
  founder_bio: {
    kind: "text", json: true, system: ROCKET_PERSONA + " You write founder bios.",
    build: (c, p) => `${ctxBlock(c, p)}\n\nReturn strict JSON (no markdown, no preamble) with this shape — fill EVERY field with real, on-brand copy:\n{\n  "x_bio": "<≤160 char X bio>",\n  "linkedin_headline": "<≤220 char LinkedIn headline>",\n  "linkedin_about": "<3-5 short paragraphs for the LinkedIn About section, written in first person>",\n  "short": "<2 sentence bio>",\n  "medium": "<4-5 sentence bio>",\n  "long": "<6-8 sentence bio>",\n  "speaker_bio": "<3-4 sentence bio written in third person, suitable for a conference program>",\n  "press_bio": "<2-3 sentence bio written in third person, suitable for a press kit>"\n}`,
  },
  template: {
    kind: "text", json: true, defaultCount: 24, system: ROCKET_PERSONA,
    build: (c, p) => `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble) for an editable branding template library. Use {{placeholders}} for editable fields (e.g. {{feature_name}}). Shape:\n{\n  "groups": [\n    { "name": "Social",    "templates": [ { "name": "X Post",          "body": "..." }, { "name": "LinkedIn Post", "body": "..." }, { "name": "LinkedIn Carousel", "body": "Slide 1: ...\\nSlide 2: ..." }, { "name": "Instagram Caption", "body": "..." }, { "name": "Instagram Story", "body": "..." }, { "name": "Threads Post", "body": "..." } ] },\n    { "name": "Launch",    "templates": [ { "name": "Product Hunt Gallery", "body": "Tagline: ...\\nSlide 1: ..." }, { "name": "Launch Graphic", "body": "Headline: ...\\nSubhead: ...\\nCTA: ..." }, { "name": "Waitlist Graphic", "body": "..." }, { "name": "Changelog Graphic", "body": "Version: ...\\nHeadline: ...\\n- ...\\n- ...\\n- ..." } ] },\n    { "name": "Marketing", "templates": [ { "name": "Ad Copy (short)", "body": "..." }, { "name": "Ad Copy (medium)", "body": "..." }, { "name": "Ad Copy (long)", "body": "..." }, { "name": "Newsletter Banner", "body": "..." }, { "name": "Blog Banner", "body": "..." }, { "name": "Sponsorship Graphic", "body": "..." } ] }\n  ]\n}\nEvery template uses the real product name above, plus {{placeholders}} for fields the founder customizes.`,
  },
  presentation: {
    kind: "text", json: true, system: ROCKET_PERSONA + " You outline startup pitch decks.",
    build: (c, p) => {
      const lp = p.toLowerCase();
      const deckType =
        /investor/.test(lp) ? "Investor Deck" :
        /product deck|product overview/.test(lp) ? "Product Deck" :
        /sales deck|sales pitch/.test(lp) ? "Sales Deck" :
        /media|press deck/.test(lp) ? "Media Deck" :
        "Pitch Deck";
      return `${ctxBlock(c, p)}\n\nReturn STRICT JSON ONLY (no markdown, no preamble) for a complete ${deckType}:\n{\n  "deck_type": "${deckType}",\n  "overview":  "<one paragraph on the deck's purpose>",\n  "slides": [\n    { "title": "...", "purpose": "<1 sentence>", "bullets": ["...","...","..."], "layout": "<Title + subtitle | Two-column | Big number | Bullet list | Quote | Image-led | Chart-led | Team grid | Timeline | Closing>", "visual_guidance": "<1-2 sentences>", "big_number"?: { "value": "...", "label": "..." }, "quote"?: { "text": "...", "attribution": "..." } }\n  ],\n  "layout_notes": "<paragraph: how a founder swaps slides per audience>"\n}\nDeliver 12-14 slides for a ${deckType}, tailored to the real product/audience above.`;
    },
  },
  other: {
    kind: "text", system: ROCKET_PERSONA,
    build: (c, p) => `${ctxBlock(c, p)}\n\nGenerate the requested asset. If not a branding asset, respond: "Rocket only creates startup branding assets — try a logo, color system, brand voice, launch copy, or social post."`,
  },
};

const CLASSIFIER_SYSTEM = `You classify a user request into ONE Rocket asset_type. Output strict JSON: {"asset_type": "<enum>", "count": <int 1-24>}.

Valid asset_type values:
- logo, graphic, icon, photo (visual)
- color_system, font_system, brand_voice, brand_guidelines (brand systems)
- launch_copy, product_hunt_copy, social_post, founder_bio (copy)
- template, presentation (compositions)
- other (ONLY for clearly non-branding requests like "write me a poem", "what's the weather". A bare URL or product name is NOT "other" — default to brand_guidelines.)

Routing hints:
- "logo", "mark" -> logo
- "brand template", "templates" -> template
- "components", "UI kit", "buttons", "cards", "inputs" -> graphic
- "icon set", "icon for X" -> icon
- "hero image", "banner", "social graphic", "ad" -> graphic
- "photo of", "lifestyle shot" -> photo
- "colors", "palette" -> color_system
- "fonts", "typography" -> font_system
- "voice", "tone" -> brand_voice
- "brand guidelines", "brand kit", "brand doc" -> brand_guidelines
- "PH copy", "product hunt" -> product_hunt_copy
- "launch copy", "landing copy" -> launch_copy
- "X post", "tweet", "thread", "LinkedIn post", "Reddit" -> social_post
- "founder bio", "about me" -> founder_bio
- "pitch deck", "slides" -> presentation
- bare URL only (e.g. "https://trylaunch.ai") or just a product name -> brand_guidelines

Count: how many variants. Generate a Looka-style gallery by default for every supported asset category. Defaults: logo=24, icon=24, graphic=24, photo=24, brand_guidelines=24, template=24, color_system=24, font_system=24, brand_voice=24, else 1. Parse explicit numbers ("5 logos" -> 5, "20 logos" -> 20). Cap at 24.

RESPOND WITH JSON ONLY.`;

const REFUSAL_TEXT =
  "Rocket only creates startup branding assets. Try: a logo, color system, font system, brand voice, brand guidelines, launch copy, Product Hunt copy, a social post, an icon, or a hero graphic.";


// Shared with frontend src/lib/logotype.ts — keep style cycle in sync.
interface LogotypeState {
  kind: "logotype";
  text: string;
  font: string;
  weight: number;
  color: string;
  letterSpacing: number;
  transform: "none" | "uppercase" | "lowercase" | "capitalize";
}

type CanvasBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  visible: boolean;
  locked: boolean;
};

type CanvasImageEl = CanvasBase & {
  kind: "image";
  src: string;
};

type CanvasTextEl = CanvasBase & {
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  align?: "left" | "center" | "right";
};

type CanvasElement = CanvasImageEl | CanvasTextEl;

const GENERIC_BRAND_NAMES = new Set([
  "brand",
  "logo",
  "logotype",
  "wordmark",
  "word mark",
  "text logo",
  "startup",
  "company",
  "product",
  "real brand",
  "a real brand",
  "my brand",
  "my startup",
  "my company",
  "my product",
  "this brand",
  "this project",
  "the brand",
]);

const DOMAIN_PREFIXES = ["try", "get", "use", "join", "go"];

function titleCase(value: string): string {
  return value
    .split(/([\s-]+)/)
    .map((part) => (/^[a-z]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function applyTransform(text: string, transform: LogotypeState["transform"]): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return titleCase(text);
  return text;
}

function cleanDomainLabel(label: string): string | undefined {
  const raw = label.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!raw || raw.length < 2) return undefined;
  const prefix = DOMAIN_PREFIXES.find((p) => raw.startsWith(p) && raw.length - p.length >= 4);
  const withoutPrefix = prefix ? raw.slice(prefix.length) : raw;
  return titleCase(withoutPrefix.replace(/-/g, " ")).replace(/\s+/g, "").trim() || undefined;
}

const STYLES: Array<Partial<LogotypeState>> = [
  { font: "Space Grotesk", weight: 700, letterSpacing: -0.03, transform: "none" },
  { font: "Geist", weight: 600, letterSpacing: -0.02, transform: "lowercase" },
  { font: "Outfit", weight: 800, letterSpacing: -0.04, transform: "none" },
  { font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "Instrument Serif", weight: 400, letterSpacing: -0.02, transform: "none" },
  { font: "Fraunces", weight: 600, letterSpacing: -0.03, transform: "none" },
  { font: "DM Serif Display", weight: 400, letterSpacing: -0.02, transform: "none" },
  { font: "Manrope", weight: 800, letterSpacing: -0.04, transform: "uppercase" },
  { font: "Syne", weight: 700, letterSpacing: 0, transform: "none" },
  { font: "Plus Jakarta Sans", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "IBM Plex Mono", weight: 500, letterSpacing: -0.04, transform: "lowercase" },
  { font: "JetBrains Mono", weight: 700, letterSpacing: -0.04, transform: "uppercase" },
  { font: "Hanken Grotesk", weight: 800, letterSpacing: -0.03, transform: "none" },
  { font: "Sora", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "Figtree", weight: 700, letterSpacing: -0.02, transform: "lowercase" },
  { font: "Onest", weight: 700, letterSpacing: -0.03, transform: "none" },
  { font: "Playfair Display", weight: 700, letterSpacing: -0.01, transform: "none" },
  { font: "Spectral", weight: 600, letterSpacing: -0.01, transform: "none" },
  { font: "Crimson Pro", weight: 700, letterSpacing: -0.01, transform: "none" },
  { font: "Recursive", weight: 700, letterSpacing: -0.03, transform: "lowercase" },
];

function normalizeLogotypeText(value?: string | null, urlHint?: string | null): string | undefined {
  if (!value) return extractNameFromUrl(urlHint || undefined);
  const fromUrl = extractNameFromUrl(value);
  if (fromUrl) return fromUrl;

  const urlFallback = extractNameFromUrl(urlHint || undefined);
  let text = String(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\.(com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b.*$/i, "")
    .split(/[|—–:]/)[0]
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .replace(/\b(logo|logotype|wordmark|brand assets?|brand kit|existing assets?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return urlFallback;
  if (text.length > 34 || text.split(/\s+/).length > 4) return urlFallback;
  if (GENERIC_BRAND_NAMES.has(text.toLowerCase())) return urlFallback;
  return titleCase(text);
}

function extractNameFromPrompt(prompt: string, urlHint?: string | null): string | undefined {
  const fromUrl = extractNameFromUrl(prompt) || extractNameFromUrl(urlHint || undefined);
  if (fromUrl) return fromUrl;

  // Highest priority: explicit quoted brand name, or "say/read/spell X".
  // These are the user's unambiguous signals and must beat generic "for ..." matches
  // like "for a real brand" in surrounding descriptive copy.
  const explicit = [
    /(?:text\s+(?:to\s+)?(?:exactly\s+)?(?:say|read|spell)|should\s+(?:say|read|spell)|say|spell|reads?)\s*[:\-]?\s*['"“”‘’]([^'"“”‘’\n]{1,40})['"“”‘’]/i,
    /['"“”‘’]([A-Za-z][A-Za-z0-9 &.\-]{0,39})['"“”‘’]/,
    /(?:text\s+(?:to\s+)?(?:exactly\s+)?(?:say|read|spell)|should\s+(?:say|read|spell)|say|spell|reads?)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 &.\-]{0,39})\b/i,
  ];
  for (const pattern of explicit) {
    const match = prompt.match(pattern)?.[1];
    const cleaned = normalizeLogotypeText(match, urlHint);
    if (cleaned) return cleaned;
  }

  const patterns = [
    /\b(?:called|named|brand(?:ed)? as)\s+([A-Za-z][A-Za-z0-9 -]{1,40})\b/i,
    /\b([A-Za-z][A-Za-z0-9 -]{1,40})\s+(?:logotype|wordmark|word mark|text logo)\b/i,
    // "for X" is a weak signal — keep it last so it doesn't swallow generic phrases
    // like "for a real brand", "for my startup", "for this project" in descriptive copy.
    /\bfor\s+([A-Za-z][A-Za-z0-9 -]{1,40})\b/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern)?.[1];
    const cleaned = normalizeLogotypeText(match, urlHint);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function pickLogotypeText(input: { prompt?: string | null; productName?: string | null; url?: string | null; fallback?: string | null }): string | undefined {
  return (
    extractNameFromPrompt(input.prompt || "", input.url) ||
    normalizeLogotypeText(input.productName, input.url) ||
    normalizeLogotypeText(input.fallback, input.url) ||
    extractNameFromUrl(input.url || undefined)
  );
}

function buildLogotypeVariants(text: string, count: number, brandColor?: string, brandFonts: string[] = []): LogotypeState[] {
  const color = brandColor && /^#[0-9a-f]{3,8}$/i.test(brandColor) ? brandColor : "#0a0a0a";
  const brandText = normalizeLogotypeText(text) || "Brand";
  const styles = [
    ...brandFonts
      .filter((font, index, arr) => !!font && arr.indexOf(font) === index)
      .slice(0, 3)
      .map((font) => ({ font, weight: 700, letterSpacing: -0.02, transform: "none" as const })),
    ...STYLES,
  ];
  const out: LogotypeState[] = [];
  for (let i = 0; i < count; i++) {
    const s = styles[i % styles.length];
    out.push({
      kind: "logotype",
      text: brandText,
      font: s.font || "Space Grotesk",
      weight: s.weight ?? 700,
      color,
      letterSpacing: s.letterSpacing ?? -0.02,
      transform: (s.transform as LogotypeState["transform"]) || "none",
    });
  }
  return out;
}

function extractNameFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const inline = String(url).match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b/i)?.[1];
  if (inline) return cleanDomainLabel(inline);
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    return host ? cleanDomainLabel(host) : undefined;
  } catch { return undefined; }
}

function buildLogoLockupEditorState(imageUrl: string, state: LogotypeState): CanvasElement[] {
  const lockupText = applyTransform(state.text, state.transform);
  const textWidth = Math.max(280, Math.min(420, Math.round(lockupText.length * 42)));
  const fontSize = lockupText.replace(/\s+/g, "").length > 14 ? 72 : lockupText.replace(/\s+/g, "").length > 10 ? 80 : 86;
  const iconSize = Math.round(fontSize * 1.35);
  const gap = Math.max(22, Math.round(fontSize * 0.32));
  const estimatedTextWidth = Math.min(textWidth, Math.max(240, Math.round(lockupText.length * fontSize * 0.54)));
  const totalWidth = iconSize + gap + estimatedTextWidth;
  const startX = Math.round((800 - totalWidth) / 2);
  const centerY = 300;
  return [
    {
      id: uid(),
      kind: "image",
      x: startX,
      y: Math.round(centerY - iconSize / 2),
      w: iconSize,
      h: iconSize,
      visible: true,
      locked: false,
      src: imageUrl,
    },
    {
      id: uid(),
      kind: "text",
      x: startX + iconSize + gap,
      // Approximate Konva's alphabetic baseline positioning so generated
      // lockups start visually center-aligned before any editor normalization.
      y: Math.round(centerY - fontSize * 0.58),
      w: textWidth,
      h: Math.round(fontSize * 1.45),
      visible: true,
      locked: false,
      text: lockupText,
      color: state.color,
      fontSize,
      fontWeight: state.weight,
      fontFamily: state.font,
      align: "left",
    },
  ];
}


const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIN_PROMPT_RESULTS = 12;

function extractUrl(text: string): string | null {
  const m = text.match(/(https?:\/\/[^\s]+|[\w-]+\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)(?:\/\S*)?)/i);
  if (!m) return null;
  const u = m[1];
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

async function mapLimit<T>(count: number, limit: number, task: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, count) }, async () => {
    while (true) {
      const index = next++;
      if (index >= count) break;
      results[index] = await task(index);
    }
  }));
  return results;
}

function requestedCount(prompt: string, fallback: number): number {
  const lower = prompt.toLowerCase();
  const wordCounts: Record<string, number> = {
    "a couple": 2, "couple": 2,
    "a few": 3, "few": 3, "several": 4, "handful": 5,
    "half a dozen": 6, "half dozen": 6,
    "a dozen": 12, "dozen": 12, "twelve": 12,
    "two dozen": 24, "lots": 12, "many": 12, "bunch": 12,
  };
  let explicitCount: number | null = null;
  for (const [word, n] of Object.entries(wordCounts)) {
    if (lower.includes(word)) { explicitCount = n; break; }
  }
  const digitMatch = prompt.match(/\b(\d{1,2})\b/);
  if (digitMatch) explicitCount = parseInt(digitMatch[1]);
  return explicitCount ? Math.max(1, Math.min(24, explicitCount)) : fallback;
}

function isLogotypeOnlyPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const wantsTextLogo = /\b(logotype|logotypes|wordmark|word\s*mark|word-mark|text[- ]?based\s+logo|text\s+logo|type[- ]?based\s+logo|typographic\s+logo|typography\s+logo|lettering|letters\s+only|name\s+only)\b/.test(lower);
  const saysTextNotLogo = /\b(text|type|typographic|typography|lettering|wordmark|logotype)\b[\s\S]{0,40}\b(not\s+(a\s+)?logo|no\s+(logo|icon|symbol|mark)|not\s+(an\s+)?icon|not\s+(a\s+)?symbol)\b/.test(lower)
    || /\b(not\s+(a\s+)?logo|no\s+(logo|icon|symbol|mark)|not\s+(an\s+)?icon|not\s+(a\s+)?symbol)\b[\s\S]{0,40}\b(text|type|typographic|typography|lettering|wordmark|logotype)\b/.test(lower);
  const wantsLogoMark = /\b(logo|logos|logo mark|logomark|brandmark|mark|symbol)\b/.test(lower);
  const wantsPictorial = /\b(icon|symbol|emblem|pictorial|illustration|graphic|mascot|badge|app\s*icon|favicon)\b/.test(lower);
  const wantsBothLogoAndLogotype = wantsTextLogo && wantsLogoMark && /\b(and|plus|with|along with|as well as|also|matching)\b/.test(lower);
  return (wantsTextLogo || saysTextNotLogo) && !wantsPictorial && !wantsBothLogoAndLogotype;
}

// Fan out graphic/icon/photo across distinct categories so a multi-variant gallery
// is a real PACK (hero, launch, pattern, illustration, social, etc.) instead of
// 24 versions of the same image. Only applied when count > 1; single-asset
// requests use the raw user prompt unchanged.
function augmentImagePrompt(assetType: AssetType, basePrompt: string, i: number, count: number): string {
  if (count <= 1) return basePrompt;
  const lower = basePrompt.toLowerCase();
  if (assetType === "graphic") {
    if (/(hero|launch|pattern|background|illustration|product showcase|social|banner|ad)/.test(lower)) return basePrompt;
    const categories = [
      "hero graphic for the website",
      "launch announcement graphic",
      "subtle abstract background pattern",
      "abstract illustration that conveys the product's value",
      "product showcase graphic featuring a UI mockup",
      "social-share graphic (1200x630) for Twitter/LinkedIn",
    ];
    const cat = categories[i % categories.length];
    return `${basePrompt}\n\nThis variant (${i + 1}/${count}) is specifically a ${cat}. Make it visually distinct from other variants while staying on-brand.`;
  }
  if (assetType === "icon") {
    const styles = [
      "outline (stroke) style icon",
      "filled (solid) style icon",
      "duotone icon using two brand colors",
      "rounded app-icon concept (rounded square background)",
    ];
    const style = styles[i % styles.length];
    return `${basePrompt}\n\nThis variant (${i + 1}/${count}) is a ${style}. Keep the icon family visually consistent across variants — same proportions, same stroke weight family, same level of detail — so they read as a single icon pack.`;
  }
  if (assetType === "photo") {
    if (i === 0) {
      return `${basePrompt}\n\nThis is variant 1 of ${count}: produce a "hero" reference photograph that defines the photography style guide for this brand — lock in the lighting (natural/studio/cinematic), composition (centered/rule-of-thirds/negative-space), color grading (warm/cool/desaturated/vibrant), and art direction. Subsequent variants will match this guide.`;
    }
    const subjects = [
      "product-in-use lifestyle shot",
      "founder/team portrait in workspace",
      "abstract texture or detail shot for backgrounds",
      "wide environmental hero shot",
      "candid customer/user moment",
      "close-up product detail",
    ];
    const subj = subjects[(i - 1) % subjects.length];
    return `${basePrompt}\n\nThis variant (${i + 1}/${count}) is a ${subj}. Match the lighting, composition, and color grading of the brand's photography style — consistent with a cohesive photo set.`;
  }
  return basePrompt;
}

function buildDirectImagePrompt(assetType: AssetType, context: BrandContext, request: string, index: number, count: number): string {
  const variation = augmentImagePrompt(assetType, request, index, count);
  const brandName = context.productName ? ` for ${context.productName}` : "";
  const colors = context.colors?.length ? ` Use only these brand colors: ${context.colors.slice(0, 4).join(", ")}.` : "";

  if (assetType === "logo") {
    return `Create one distinct, original logo mark${brandName}. Brief: ${variation}. Flat geometric vector, iconic and scalable, centred on a solid white background. No words, letters, typography, gradients, mockups, or photorealism.${colors}`;
  }

  if (assetType === "icon") {
    return `Create one polished icon${brandName}. Brief: ${variation}. Clean vector design on a solid white background, with strong silhouette and consistent stroke weight. No words, letters, mockups, or photorealism.${colors}`;
  }

  if (assetType === "graphic") {
    return `Create one polished brand graphic${brandName}. Brief: ${variation}. Use a clear visual hierarchy and a production-ready composition. Do not include unreadable text or device mockups unless the brief explicitly asks for them.${colors}`;
  }

  return `Create one polished brand photograph${brandName}. Brief: ${variation}. Use realistic lighting, intentional composition, and a cohesive art direction. Do not include unreadable text overlays.${colors}`;
}

async function classify(prompt: string): Promise<{ asset_type: AssetType; count: number }> {
  try {
    const out = await geminiText({ system: CLASSIFIER_SYSTEM, user: prompt, temperature: 0.1, json: true });
    const parsed = JSON.parse(out);
    const at = (parsed.asset_type || "other") as AssetType;
    if (!(at in GENERATORS)) return { asset_type: "other", count: 1 };
    // Parse any explicit count from the prompt — number-before-noun, number-after-noun,
    // or spelled-out words like "dozen", "a few", "couple". The classifier's own count
    // under-counts, so we ignore it.
    const fallback = Math.max(GENERATORS[at].defaultCount || 1, MIN_PROMPT_RESULTS);
    const c = requestedCount(prompt, fallback);
    return { asset_type: at, count: c };
  } catch {
    return { asset_type: "other", count: 1 };
  }
}

async function scrapeUrl(url: string, supabaseUrl: string, anonKey: string, jwt: string): Promise<BrandContext> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/scrape-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return { url };
    const d = await res.json();
    if (d?.error) return { url };
    return {
      url,
      productName: d.productName,
      tagline: d.tagline,
      description: d.description,
      colors: d.colors,
      fonts: d.fonts,
      logo: d.logo,
      favicon: d.favicon,
      ogImage: d.ogImage,
      colorScheme: d.colorScheme,
      screenshot: d.screenshot,
    };
  } catch {
    return { url };
  }
}

Deno.serve(async (req) => {
  const ch = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: ch });
  let releaseReservation: (() => Promise<void>) | null = null;
  try {
    if (!hasGeminiKey()) {
      return new Response(JSON.stringify({ error: "missing_environment_variable", variable: "GEMINI_API_KEY" }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    }
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });
    const jwt = auth.replace(/^Bearer\s+/i, "");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });

    const body = await req.json();
    const prompt = (body.prompt || "").toString().trim();
    const project_id = body.project_id || null;
    const client_workspace_id = body.workspace_id || null;
    const requestedVariantCount =
      typeof body.count === "number" && Number.isFinite(body.count)
        ? Math.max(1, Math.min(24, body.count))
        : null;
    const requestedLockup = !!body.requested_lockup;
    const explicitType = body.asset_type as AssetType | undefined;
    const providedCtx = body.brand_context as BrandContext | undefined;
    if (!prompt) return new Response(JSON.stringify({ error: "prompt required" }), { status: 400, headers: { ...ch, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve workspace_id only after establishing the caller owns the project
    // or belongs to its workspace. These writes use service role, so this check
    // is the authorization boundary for client-provided IDs.
    let workspace_id: string | null = null;
    if (project_id) {
      const { data: p } = await admin.from("projects").select("workspace_id,user_id").eq("id", project_id).maybeSingle();
      if (!p) return new Response(JSON.stringify({ error: "project_not_found" }), { status: 404, headers: { ...ch, "Content-Type": "application/json" } });
      let allowed = p.user_id === user.id;
      if (!allowed && p.workspace_id) {
        const { data: membership } = await admin
          .from("workspace_members")
          .select("workspace_id")
          .eq("workspace_id", p.workspace_id)
          .eq("user_id", user.id)
          .maybeSingle();
        allowed = !!membership;
      }
      if (!allowed) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...ch, "Content-Type": "application/json" } });
      workspace_id = (p as any)?.workspace_id || null;
    }
    if (!workspace_id && client_workspace_id) workspace_id = client_workspace_id;
    if (workspace_id) {
      const { data: membership } = await admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...ch, "Content-Type": "application/json" } });
    }
    if (!workspace_id) {
      const { data: ws } = await admin.from("workspaces").select("id").eq("owner_id", user.id).eq("is_personal", true).maybeSingle();
      workspace_id = (ws as any)?.id || null;
    }

    // Classify
    let cls = explicitType
      ? { asset_type: explicitType, count: requestedVariantCount || GENERATORS[explicitType].defaultCount || 1 }
      : await classify(prompt);
    if (requestedVariantCount == null && cls.asset_type !== "other") {
      cls = { ...cls, count: Math.max(cls.count, MIN_PROMPT_RESULTS) };
    }
    const logotypeOnly = isLogotypeOnlyPrompt(prompt);
    if (logotypeOnly) {
      cls = {
        asset_type: "logo",
        count: requestedVariantCount || Math.max(requestedCount(prompt, MIN_PROMPT_RESULTS), MIN_PROMPT_RESULTS),
      };
    }

    // Refuse non-branding
    if (cls.asset_type === "other") {
      const refusalAsset = {
        user_id: user.id, workspace_id, project_id,
        asset_type: "other" as const,
        title: "Out of scope",
        content: REFUSAL_TEXT,
        prompt,
      };
      const { data: a } = await admin.from("assets").insert(refusalAsset).select().single();
      return new Response(JSON.stringify({ refused: true, message: REFUSAL_TEXT, asset_ids: a ? [a.id] : [] }), { headers: { ...ch, "Content-Type": "application/json" } });
    }

    // Detect URL & scrape
    const detectedUrl = extractUrl(prompt);
    let ctx: BrandContext = { url: detectedUrl || undefined };
    if (providedCtx && (providedCtx.url || providedCtx.productName || providedCtx.colors?.length)) {
      ctx = { ...providedCtx, url: providedCtx.url || detectedUrl || undefined };
    } else if (detectedUrl) {
      ctx = await scrapeUrl(detectedUrl, SUPABASE_URL, SUPABASE_ANON_KEY, jwt);
    } else if (project_id) {
      const { data: proj } = await admin.from("projects").select("name").eq("id", project_id).maybeSingle();
      if (proj?.name) ctx = { productName: proj.name };
    }

    // Cost calculation. Reservation happens atomically after the free logotype
    // path, before any external AI work is started.
    const spec = GENERATORS[cls.asset_type];
    const count = cls.count;
    const costPer = spec.kind === "image" ? 10 : 1;
    const totalCost = costPer * count;
    const title = cls.asset_type === "graphic" && /component|ui kit|buttons|cards|inputs/i.test(prompt) ? "Component" : ASSET_TITLES[cls.asset_type];
    const ids: string[] = [];

    // ─── Logotype-only fast path ──────────────────────────────────────────
    // If the user explicitly asks for a logotype / wordmark / text-based logo
    // (and NOT a pictorial mark/icon), skip Gemini image generation entirely
    // and return only editable text-based logotype variants. Free of charge.
    if (logotypeOnly) {
      try {
        const brandText = pickLogotypeText({
          prompt,
          productName: ctx.productName,
          url: ctx.url || detectedUrl,
        });
        if (!brandText) {
          return new Response(JSON.stringify({ error: "brand_name_required", message: "I need a brand name or URL to create a wordmark." }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
        }
        const brandColor = ctx.colors?.[0];
        const variants = buildLogotypeVariants(brandText, count, brandColor, ctx.fonts || []);
        const rows = variants.map((state, i) => ({
          user_id: user.id,
          workspace_id,
          project_id,
          asset_type: "logo" as const,
          title: count > 1 ? `Logotype ${i + 1}` : "Logotype",
          prompt,
          source_url: detectedUrl,
          editor_state: state,
          meta: { brand_context: ctx, kind: "logotype", variant: i + 1, of: count },
        }));
        const { data: inserted } = await admin.from("assets").insert(rows).select("id");
        if (inserted) for (const row of inserted) ids.push(row.id);
      } catch (e) {
        console.error("logotype-only gen failed", e);
      }
      return new Response(JSON.stringify({ asset_ids: ids, asset_type: "logo", count: ids.length, credits_charged: 0 }), { headers: { ...ch, "Content-Type": "application/json" } });
    }
    // ──────────────────────────────────────────────────────────────────────

    const { data: reserved, error: reserveError } = await admin.rpc("reserve_generation_credits", {
      p_user_id: user.id,
      p_credits: totalCost,
    });
    if (reserveError) throw reserveError;
    if (!reserved) {
      return new Response(JSON.stringify({ error: "no_credits", code: "no_credits", needed: totalCost }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    }
    let reservedCredits = totalCost;
    releaseReservation = async () => {
      if (reservedCredits <= 0) return;
      const credits = reservedCredits;
      reservedCredits = 0;
      const { error } = await admin.rpc("release_generation_credits", { p_user_id: user.id, p_credits: credits });
      if (error) console.error("credit release failed", error);
    };

    // Fetch visual references from the scraped brand. Gemini only accepts raster
    // formats (jpg/png/webp), so SVG/ICO/AVIF get rasterized through wsrv.nl,
    // a free image proxy that converts arbitrary image URLs to PNG.
    async function fetchAsRef(u?: string | null): Promise<{ mimeType: string; data: string } | null> {
      if (!u) return null;
      const fetchWithTimeout = async (url: string): Promise<Response | null> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4_000);
        try {
          return await fetch(url, { signal: controller.signal });
        } catch {
          return null;
        } finally {
          clearTimeout(timeout);
        }
      };
      const directThenProxy = async (url: string): Promise<Response | null> => {
        try {
          const r = await fetchWithTimeout(url);
          if (!r?.ok) return null;
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          // If it's a format Gemini can't consume directly (svg/ico/avif/heic),
          // re-fetch via wsrv.nl to rasterize to PNG.
          if (!ct || ct.includes("svg") || ct.includes("icon") || ct.includes("avif") || ct.includes("heic")) {
            const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}&output=png&w=1024&we`;
            const p = await fetchWithTimeout(proxied);
            return p?.ok ? p : null;
          }
          return r;
        } catch { return null; }
      };
      try {
        const r = await directThenProxy(u);
        if (!r) return null;
        let ct = (r.headers.get("content-type") || "image/png").split(";")[0].toLowerCase();
        if (!/^image\/(png|jpeg|jpg|webp)$/.test(ct)) ct = "image/png";
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf.length === 0 || buf.length > 4_000_000) return null;
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return { mimeType: ct, data: btoa(bin) };
      } catch { return null; }
    }

    // Visual refs used for ALL image generation so the output evolves the existing brand.
    // For logos: always include the logo image first (rasterized if SVG) AND the
    // homepage screenshot so Gemini sees both the mark and its in-context palette.
    let logoRefs: { mimeType: string; data: string }[] | undefined;
    if (spec.kind === "image") {
      const candidates: (string | undefined)[] = [];
      const selectedDirectionImage = ctx.selected_direction?.image_url;
      const selectedDirectionIsLogo = /^(logo|logotype|wordmark)$/.test(ctx.selected_direction?.asset_type || "");
      if (cls.asset_type === "logo") {
        candidates.push(selectedDirectionIsLogo ? selectedDirectionImage : undefined, ctx.logo, ctx.screenshot, ctx.ogImage, ctx.favicon);
      } else {
        candidates.push(selectedDirectionImage, ctx.screenshot, ctx.ogImage, ctx.logo);
      }
      const refs: { mimeType: string; data: string }[] = [];
      for (const u of candidates) {
        if (refs.length >= 2) break;
        const ref = await fetchAsRef(u);
        if (ref) refs.push(ref);
      }
      if (refs.length) {
        logoRefs = refs;
        console.log(`[refs] attached ${refs.length} brand ref image(s) for ${cls.asset_type} (selected_direction=${!!selectedDirectionImage} logo=${!!ctx.logo} screenshot=${!!ctx.screenshot} favicon=${!!ctx.favicon})`);
      } else {
        console.warn(`[refs] NO brand refs resolved for ${cls.asset_type} — ctx urls: logo=${ctx.logo} screenshot=${ctx.screenshot} favicon=${ctx.favicon} ogImage=${ctx.ogImage}`);
      }
    }

    if (spec.kind === "image") {
      // Generate N image variants in parallel
      const createImageVariant = async (i: number) => {
        let imgPrompt: string;
        if (cls.asset_type === "logo" && logoRefs) {
          // Skip the text-prompt rewrite step entirely. Feed a stable variation instruction + reference image directly.
          const variantHint = ["alternate angle", "monochrome (single brand color on white)", "simplified minimal version", "refined geometry, more polished", "badge / circle enclosure"][i % 5];
          imgPrompt = `Create a logo VARIATION of the brand shown in the attached reference image${ctx.productName ? ` ("${ctx.productName}")` : ""}.\n\nHARD RULES:\n- KEEP the same core motif/symbol from the reference (do not invent a new unrelated concept).\n- KEEP the same silhouette family, proportions, and overall style.\n- KEEP the exact brand colors${ctx.colors?.length ? `: ${ctx.colors.slice(0,3).join(", ")}` : " from the reference"}. No new colors.\n- This variant: ${variantHint}.\n- Solid white background, flat vector, app-icon ready, no text, no typography, no letters.\n- The result must look like it belongs to the SAME brand as the reference.`;
        } else {
          imgPrompt = buildDirectImagePrompt(cls.asset_type, ctx, prompt, i, count);
          if (logoRefs) {
            imgPrompt += "\n\nReference images are attached. Evolve their existing visual language and do not invent a separate identity.";
          }
        }
        const png = await generateImage(imgPrompt, logoRefs);
        const path = `${user.id}/${Date.now()}-${i}.png`;
        const { error: upErr } = await admin.storage.from("rocket-images").upload(path, png, { contentType: "image/png", upsert: false });
        if (upErr) throw new Error(`storage: ${upErr.message}`);
        const { data: pub } = admin.storage.from("rocket-images").getPublicUrl(path);
        const { data: asset } = await admin.from("assets").insert({
          user_id: user.id, workspace_id, project_id,
          asset_type: cls.asset_type,
          title: count > 1 ? `${title} ${i + 1}` : title,
          image_url: pub.publicUrl,
          thumbnail_url: pub.publicUrl,
          prompt,
          source_url: detectedUrl,
          meta: { brand_context: ctx, image_prompt: imgPrompt, variant: i + 1, of: count, used_logo_ref: !!logoRefs },
        }).select().single();
        return asset?.id ? { id: asset.id, image_url: pub.publicUrl, variant: i + 1 } : undefined;
      };
      // Per-variant failures must not abort the whole batch. Image requests are
      // bounded inside generateImage, so repeating them here risks exceeding the
      // Edge Function timeout and discarding otherwise successful results.
      let lastUnavailable: ImageProviderUnavailableError | null = null;
      const safeVariant = async (i: number) => {
        try {
          return await createImageVariant(i);
        } catch (error) {
          if (error instanceof ImageProviderUnavailableError) lastUnavailable = error;
          console.error(`variant ${i} failed: ${(error as Error).message}`);
          return undefined;
        }
      };
      // Lower concurrency (2) — Gemini image rate-limits aggressively above this,
      // which is why users were getting ~6/10 instead of the full count.
      const results = await mapLimit(count, 2, safeVariant);
      const createdImages = results.filter((result): result is { id: string; image_url: string; variant: number } => !!result);
      for (const result of createdImages) ids.push(result.id);
      // If literally every variant failed AND it was a provider outage, surface that.
      if (ids.length === 0 && lastUnavailable) {
        throw lastUnavailable;
      }

      // When generating logos, also generate matching logotype (text wordmark) variants.
      // These are free (no Gemini call) and editable in the client.
      if (cls.asset_type === "logo") {
        try {
          const brandText = pickLogotypeText({ prompt, productName: ctx.productName, url: ctx.url || detectedUrl });
          if (!brandText) throw new Error("brand name missing for logotype add-on");
          const brandColor = ctx.colors?.[0];
          const variants = buildLogotypeVariants(brandText, count, brandColor, ctx.fonts || []);
          const successfulCount = createdImages.length;
          const rows = createdImages.map((image, i) => {
            const state = variants[i % variants.length];
            return requestedLockup ? {
              user_id: user.id,
              workspace_id,
              project_id,
              asset_type: "logo" as const,
              title: successfulCount > 1 ? `Logo Lockup ${image.variant}` : "Logo Lockup",
              prompt,
              source_url: detectedUrl,
              editor_state: buildLogoLockupEditorState(image.image_url, state),
              meta: { brand_context: ctx, kind: "logo_lockup", variant: image.variant, of: successfulCount, source_logo_url: image.image_url },
            } : {
              user_id: user.id,
              workspace_id,
              project_id,
              asset_type: "logo" as const,
              title: count > 1 ? `Logotype ${image.variant}` : "Logotype",
              prompt,
              source_url: detectedUrl,
              editor_state: state,
              meta: { brand_context: ctx, kind: "logotype", variant: image.variant, of: successfulCount || count },
            };
          });
          const { data: inserted } = await admin.from("assets").insert(rows).select("id");
          if (inserted) for (const row of inserted) ids.push(row.id);
        } catch (e) {
          console.error("logotype gen failed", e);
        }
      }
    } else {
      const results = await mapLimit(count, 6, async (i) => {
        const variantPrompt = count > 1 ? `${prompt}\n\nCreate variation ${i + 1} of ${count}. Make it meaningfully distinct in structure, angle, naming, and recommendations while staying on-brand.` : prompt;
        const content = await geminiText({ system: spec.system, user: spec.build(ctx, variantPrompt), temperature: 0.7, json: !!spec.json });
        const { data: asset } = await admin.from("assets").insert({
          user_id: user.id, workspace_id, project_id,
          asset_type: cls.asset_type,
          title: count > 1 ? `${title} ${i + 1}` : title,
          content,
          prompt,
          source_url: detectedUrl,
          meta: { brand_context: ctx, variant: i + 1, of: count },
        }).select().single();
        return asset?.id;
      });
      for (const id of results) if (id) ids.push(id);
    }

    // The reservation covered the requested batch. Return any unused portion
    // when variants fail, then record only the final charge.
    const billableCount = spec.kind === "image"
      ? Math.min(count, ids.length) // only the image variants, not free rows appended after
      : ids.length;
    const actualCost = costPer * billableCount;
    if (actualCost < totalCost) {
      const unused = totalCost - actualCost;
      const { error } = await admin.rpc("release_generation_credits", { p_user_id: user.id, p_credits: unused });
      if (error) throw error;
      reservedCredits -= unused;
    }
    if (actualCost > 0) {
      const { error } = await admin.from("credit_transactions").insert({
        user_id: user.id, asset_type: cls.asset_type,
        kind: "spent", credits: actualCost, meta: { count: billableCount, requested: count, asset_ids: ids },
      });
      if (error) console.error("credit transaction log failed", error);
    }
    // Credits are settled; do not release them in the outer error handler.
    reservedCredits = 0;

    return new Response(JSON.stringify({ asset_ids: ids, asset_type: cls.asset_type, count: ids.length, credits_charged: actualCost }), { headers: { ...ch, "Content-Type": "application/json" } });
  } catch (e) {
    await releaseReservation?.();
    console.error(e);
    if (e instanceof GeminiUnavailableError || e instanceof ImageProviderUnavailableError) {
      return new Response(JSON.stringify({ error: "ai_provider_unavailable", message: "Rocket is busy right now. Please try again in a moment.", details: e.bodyText.slice(0, 300) }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
  }
});
