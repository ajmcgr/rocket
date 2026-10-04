import { lookup } from "node:dns/promises";
import { Buffer } from "node:buffer";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const TRACKING = /^(utm_[a-z0-9_]+|gclid|fbclid|msclkid|mc_cid|mc_eid)$/i;
const BLOCKED_HOST =
  /(^localhost$|\.localhost$|\.local$|\.internal$|\.test$|\.invalid$|\.example$|\.onion$)/i;
const MAX_REDIRECTS = 3;

export function parsePublicUrl(input: string): URL {
  if (typeof input !== "string" || input.length > 2048)
    throw new Error("Enter a public website URL");
  const text = input.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : `https://${text}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid public website URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    BLOCKED_HOST.test(url.hostname) ||
    url.hostname.endsWith(".") ||
    isIP(url.hostname)
  ) {
    throw new Error("Only ordinary public HTTP(S) websites are supported");
  }
  url.hash = "";
  return url;
}

export function normalizeSourceUrl(input: string): string {
  const url = parsePublicUrl(input);
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  for (const key of [...url.searchParams.keys()])
    if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}

export function classifySource(
  url: URL,
): "website" | "launch" | "github" | "hacker_news" | "unsupported" {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "trylaunch.ai" && /^\/launch\/[^/]+\/?$/.test(url.pathname))
    return "launch";
  if (
    host === "github.com" &&
    /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)
  )
    return "github";
  if (
    host === "news.ycombinator.com" &&
    url.pathname === "/item" &&
    /^\d+$/.test(url.searchParams.get("id") || "")
  )
    return "hacker_news";
  if (["producthunt.com", "apps.apple.com", "play.google.com"].includes(host))
    return "unsupported";
  return "website";
}

function publicIPv4(ip: string): boolean {
  const a = ip.split(".").map(Number);
  if (a.length !== 4 || a.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [x, y, z] = a;
  return !(
    x === 0 ||
    x === 10 ||
    x === 127 ||
    x >= 224 ||
    (x === 100 && y >= 64 && y <= 127) ||
    (x === 169 && y === 254) ||
    (x === 172 && y >= 16 && y <= 31) ||
    (x === 192 &&
      (y === 168 || (y === 0 && z === 0) || (y === 0 && z === 2))) ||
    (x === 198 && (y === 18 || y === 19 || (y === 51 && z === 100))) ||
    (x === 203 && y === 0 && z === 113)
  );
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return publicIPv4(ip);
  if (family !== 6) return false;
  const value = ip.toLowerCase();
  if (
    value.includes(".") ||
    value.startsWith("::ffff:") ||
    value.startsWith("::")
  )
    return false;
  // Conservative global-unicast allowlist. Reject ULA, link-local, loopback,
  // documentation, transition and special-purpose address ranges.
  return (
    /^[23][0-9a-f]{3}:/.test(value) &&
    !/^2001:(0|2|10|db8):/i.test(value) &&
    !/^2002:/i.test(value)
  );
}

async function pinnedAddress(
  hostname: string,
): Promise<{ address: string; family: number }> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (
    !records.length ||
    records.some((record) => !isPublicAddress(record.address))
  )
    throw new Error("Website resolves to an unsafe network address");
  return records[0];
}

// Native Deno sockets preserve TLS SNI while connecting to a vetted address.
// The Node HTTP compatibility layer ignores servername in Edge Runtime.
export async function denoRequest(url: URL, address: string, maxBytes: number) {
  const runtime = (globalThis as any).Deno;
  let conn: any;
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const work = async () => {
    conn = await runtime.connect({
      hostname: address,
      port: url.protocol === "https:" ? 443 : 80,
    });
    if (expired) {
      conn.close();
      throw new Error("Website request timed out");
    }
    if (url.protocol === "https:")
      conn = await runtime.startTls(conn, { hostname: url.hostname });
    if (expired) {
      conn.close();
      throw new Error("Website request timed out");
    }
    const request = new TextEncoder().encode(
      `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nUser-Agent: RocketAppDiscovery/1.0\r\nAccept: text/html,application/json,image/*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
    );
    for (let sent = 0; sent < request.length;)
      sent += await conn.write(request.subarray(sent));
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const buffer = new Uint8Array(16384);
      const n = await conn.read(buffer);
      if (n === null) break;
      size += n;
      if (size > maxBytes + 65536)
        throw new Error("Website response is too large");
      chunks.push(buffer.slice(0, n));
    }
    const raw = Buffer.concat(chunks);
    const end = raw.indexOf("\r\n\r\n");
    if (end < 0 || end > 16384)
      throw new Error("Invalid website response headers");
    const lines = raw.subarray(0, end).toString("utf8").split("\r\n");
    const status = Number(
      /^HTTP\/1\.[01] (\d{3})/.exec(lines.shift() || "")?.[1],
    );
    if (!status) throw new Error("Invalid website response status");
    const headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0)
        headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    if (Number(headers.get("content-length")) > maxBytes)
      throw new Error("Website response is too large");
    let bytes: Uint8Array = raw.subarray(end + 4);
    if (/chunked/i.test(headers.get("transfer-encoding") || "")) {
      const decoded: Uint8Array[] = [];
      let offset = 0;
      let total = 0;
      while (true) {
        const lineEnd = raw.indexOf("\r\n", end + 4 + offset);
        if (lineEnd < 0) throw new Error("Invalid chunked website response");
        const lengthText = raw
          .subarray(end + 4 + offset, lineEnd)
          .toString("ascii")
          .split(";")[0];
        if (!/^[0-9a-f]+$/i.test(lengthText))
          throw new Error("Invalid chunked website response");
        const length = parseInt(lengthText, 16);
        offset = lineEnd - end - 4 + 2;
        if (!length) break;
        total += length;
        if (total > maxBytes) throw new Error("Website response is too large");
        if (
          offset + length + 2 > bytes.length ||
          bytes[offset + length] !== 13 ||
          bytes[offset + length + 1] !== 10
        )
          throw new Error("Truncated website response");
        decoded.push(bytes.subarray(offset, offset + length));
        offset += length + 2;
      }
      bytes = Buffer.concat(decoded);
    }
    if (bytes.length > maxBytes)
      throw new Error("Website response is too large");
    const declared = headers.get("content-length");
    if (
      declared &&
      !headers.has("transfer-encoding") &&
      Number(declared) !== bytes.length
    )
      throw new Error("Truncated website response");
    return {
      status,
      location: headers.get("location") || undefined,
      contentType: (headers.get("content-type") || "")
        .split(";")[0]
        .toLowerCase(),
      bytes,
    };
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          try {
            conn?.close();
          } catch {}
          reject(new Error("Website request timed out"));
        }, 6000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
    try {
      conn?.close();
    } catch {}
  }
}

export async function fetchPublicBytes(
  input: string,
  maxBytes = 512_000,
): Promise<{ url: string; contentType: string; bytes: Uint8Array }> {
  let url = parsePublicUrl(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const pinned = await pinnedAddress(url.hostname);
    const transport = url.protocol === "https:" ? https : http;
    const response = (globalThis as any).Deno?.startTls
      ? await denoRequest(url, pinned.address, maxBytes)
      : await new Promise<{
          status: number;
          location?: string;
          contentType: string;
          bytes: Uint8Array;
        }>((resolve, reject) => {
          // Supabase's Node compatibility layer does not implement options.lookup.
          // Connect to the already-vetted IP directly, but retain the original Host
          // and TLS server name (including normal certificate verification).
          const req = transport.request(
            {
              hostname: pinned.address,
              port: url.protocol === "https:" ? 443 : 80,
              servername: url.hostname,
              path: `${url.pathname}${url.search}`,
              method: "GET",
              timeout: 6000,
              headers: {
                Host: url.hostname,
                "User-Agent": "RocketAppDiscovery/1.0",
                Accept: "text/html,application/json,image/*;q=0.8",
              },
            },
            (res) => {
              const length = Number(res.headers["content-length"] || 0);
              if (length > maxBytes) {
                res.destroy();
                reject(new Error("Website response is too large"));
                return;
              }
              let size = 0;
              const chunks: Uint8Array[] = [];
              res.on("data", (chunk: Uint8Array) => {
                size += chunk.length;
                if (size > maxBytes) {
                  res.destroy();
                  reject(new Error("Website response is too large"));
                  return;
                }
                chunks.push(chunk);
              });
              res.on("end", () =>
                resolve({
                  status: res.statusCode || 0,
                  location:
                    typeof res.headers.location === "string"
                      ? res.headers.location
                      : undefined,
                  contentType: String(res.headers["content-type"] || "")
                    .split(";")[0]
                    .toLowerCase(),
                  bytes: Buffer.concat(chunks),
                }),
              );
              res.on("error", reject);
            },
          );
          req.on("timeout", () =>
            req.destroy(new Error("Website request timed out")),
          );
          req.on("error", reject);
          req.end();
        });
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirect === MAX_REDIRECTS)
        throw new Error("Too many website redirects");
      url = parsePublicUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Website returned HTTP ${response.status}`);
    return {
      url: url.toString(),
      contentType: response.contentType,
      bytes: response.bytes,
    };
  }
  throw new Error("Too many website redirects");
}

const decode = (value: string) =>
  value.replace(
    /&(?:amp|quot|apos|lt|gt|#39);/g,
    (entity) =>
      ({
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&#39;": "'",
      })[entity] || entity,
  );
function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  ))
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? "");
  return result;
}
export function extractHtml(html: string, pageUrl: string) {
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const get = (key: string) =>
    meta.find(
      (item) => (item.property || item.name || "").toLowerCase() === key,
    )?.content;
  const title = decode(
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "",
  );
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const link = (rel: string) =>
    links.find((item) =>
      (item.rel || "").toLowerCase().split(/\s+/).includes(rel),
    )?.href;
  const abs = (value?: string) => {
    try {
      return value
        ? parsePublicUrl(new URL(value, pageUrl).toString()).toString()
        : null;
    } catch {
      return null;
    }
  };
  const jsonLd: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value = JSON.parse(match[1]);
      if (value && typeof value === "object") jsonLd.push(value);
    } catch {
      /* untrusted metadata */
    }
  }
  const name = (get("og:site_name") || get("og:title") || title)
    .split(/\s+[|—–]\s+/)[0]
    .trim()
    .slice(0, 240);
  return {
    name,
    description: (get("og:description") || get("description") || "")
      .trim()
      .slice(0, 2000),
    canonicalUrl: abs(link("canonical")) || pageUrl,
    imageUrl: abs(get("og:image")) || abs(link("icon")),
    faviconUrl: abs(link("icon")) || abs("/favicon.ico"),
    pricingUrl: abs(
      links.find((item) => /pricing/i.test(item.href || ""))?.href,
    ),
    jsonLd: jsonLd.slice(0, 3).map((item) => ({
      "@type": item["@type"],
      name: item.name,
      url: item.url,
    })),
  };
}
