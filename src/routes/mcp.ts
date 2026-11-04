import { createFileRoute } from "@tanstack/react-router";
import { PublicCatalogue } from "@/lib/mcp/catalog";
import { createRocketMcpHandler } from "@/lib/mcp/server";

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 30;
const MAX_BODY_BYTES = 16_384;
const buckets = new Map<string, { count: number; resetsAt: number }>();

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Native MCP clients generally send no Origin.
  if (origin === "https://tryrocket.ai" || origin === "https://www.tryrocket.ai") return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function rateLimited(address: string, now = Date.now()) {
  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) if (bucket.resetsAt <= now) buckets.delete(key);
  }
  const bucket = buckets.get(address);
  if (!bucket || bucket.resetsAt <= now) {
    buckets.set(address, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > REQUEST_LIMIT;
}

function response(message: string, status: number) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export async function serve(request: Request) {
  if (!allowedOrigin(request)) return response("Origin not allowed", 403);
  if (rateLimited(clientAddress(request))) return response("Rate limit exceeded", 429);
  if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    return Response.redirect(new URL("/docs/rocket-mcp", request.url), 302);
  }
  const length = Number(request.headers.get("content-length") || "0");
  if (length > MAX_BODY_BYTES) return response("Request too large", 413);
  if (request.method === "POST") {
    const reader = request.body?.getReader();
    if (!reader) return response("Request body required", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return response("Request too large", 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    request = new Request(request, { body });
  }
  const endpoint = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!endpoint || !key) return response("Public catalogue unavailable", 503);
  const handler = createRocketMcpHandler(new PublicCatalogue(endpoint, key));
  try {
    const result = await Promise.race([
      handler.fetch(request),
      new Promise<Response>((resolve) => setTimeout(() => resolve(response("Request timed out", 504)), 10_000)),
    ]);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return response("MCP request failed", 500);
  }
}

export const Route = createFileRoute("/mcp")({
  server: { handlers: {
    GET: ({ request }) => serve(request),
    POST: ({ request }) => serve(request),
    DELETE: ({ request }) => serve(request),
  } },
});
