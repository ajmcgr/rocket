import { validateContactMessage } from "../_shared/contactValidation.ts";

const RECIPIENT = "alex@tryrocket.ai";
const ALLOWED_ORIGINS = new Set([
  "https://tryrocket.ai",
  "https://www.tryrocket.ai",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8082",
  "http://127.0.0.1:8083",
]);
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 3;
const attempts = new Map<string, { count: number; resetAt: number }>();

function json(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://tryrocket.ai",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: "Forbidden" }, 403, origin);
  if (req.method === "OPTIONS") return json({}, 200, origin);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!req.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "Invalid content type" }, 415, origin);
  }

  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8000) return json({ error: "Message too long" }, 413, origin);
    input = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request" }, 400, origin);
  }

  // Honeypot: silently accept automated submissions without sending mail.
  if (input && typeof input.website === "string" && input.website.trim()) return json({ ok: true }, 200, origin);
  const contact = validateContactMessage(input);
  if (!contact) return json({ error: "Please check your contact details and message" }, 400, origin);

  // Best-effort per-instance protection; the recipient is fixed and no visitor
  // can choose another destination. Production edge/WAF limits can add breadth.
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = ip;
  const now = Date.now();
  if (attempts.size > 1000) {
    for (const [address, slot] of attempts) if (slot.resetAt <= now) attempts.delete(address);
  }
  const previous = attempts.get(key);
  if (previous && previous.resetAt > now && previous.count >= MAX_REQUESTS) {
    return json({ error: "Please wait a while before sending another message" }, 429, origin);
  }
  attempts.set(key, previous && previous.resetAt > now
    ? { count: previous.count + 1, resetAt: previous.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS });

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "Contact is temporarily unavailable" }, 503, origin);
  const from = (Deno.env.get("EMAIL_FROM") || "Rocket <hello@tryrocket.ai>").replace(/^["']+|["']+$/g, "");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: contact.email,
        subject: `Rocket contact: ${contact.topic}`,
        text: `Name: ${contact.name}\nEmail: ${contact.email}\nTopic: ${contact.topic}\n\n${contact.message}`,
      }),
    });
    if (!response.ok) return json({ error: "We couldn't send your message. Please try again later." }, 502, origin);
    return json({ ok: true }, 200, origin);
  } catch {
    return json({ error: "We couldn't send your message. Please try again later." }, 502, origin);
  }
});
