const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const GEMINI_IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image-preview";

const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const RETRY_DELAYS_MS = [800, 2000, 5000];
const GEMINI_IMAGE_TIMEOUT_MS = 40_000;

type GeminiFetchOptions = {
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
};

export function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}

export class GeminiUnavailableError extends Error {
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

export async function geminiText(opts: { system: string; user: string; temperature?: number; json?: boolean }): Promise<string> {
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

export async function geminiImage(
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

export const ALLOWED_ORIGINS = [
  "https://tryrocket.ai",
  "https://www.tryrocket.ai",
  "http://localhost:5173",
  "http://localhost:3000",
];

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
