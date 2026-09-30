import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

const base = process.env.ROCKET_SUPABASE_URL || "https://lcujmvdgczkjxdstzhnr.supabase.co";
const key = process.env.ROCKET_SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("ROCKET_SUPABASE_SERVICE_ROLE_KEY is required");

async function rpc(name, body) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Rocket website check ${name}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0 && (c === 0 || c === 2))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  return family === 6 && /^[23][0-9a-f]{3}:/i.test(address)
    && !/^2001:(0|2|10|db8):/i.test(address) && !/^2002:/i.test(address);
}

function publicUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
    || url.port || isIP(url.hostname) || !url.hostname.includes(".")
    || /(^localhost$|\.localhost$|\.local$|\.internal$|\.onion$)/i.test(url.hostname))
    throw new Error("Unsafe website URL");
  return url;
}

function requestStatus(url, pinned, method) {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method, timeout: 6000,
      lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
      headers: { "User-Agent": "RocketWebsiteHealth/1.0", Accept: "text/html,*/*;q=0.5",
        ...(method === "GET" ? { Range: "bytes=0-0" } : {}) },
    }, (result) => {
      const status = result.statusCode || 0;
      const location = result.headers.location;
      result.destroy();
      resolve({ status, location });
    });
    request.on("timeout", () => request.destroy(new Error("Timeout")));
    request.on("error", reject);
    request.end();
  });
}

async function probe(value) {
  let url = publicUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    let addresses;
    try { addresses = await lookup(url.hostname, { all: true, verbatim: true }); }
    catch (error) { return error?.code === "ENOTFOUND" ? "hard_failure" : "uncertain"; }
    if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) return "uncertain";
    const pinned = addresses[0];
    let response;
    try {
      response = await requestStatus(url, pinned, "HEAD");
      // Some sites reject HEAD even while the actual page works. Confirm a
      // hard failure with a bounded GET before it contributes to de-emphasis.
      if ([404, 405, 410, 501].includes(response.status)) response = await requestStatus(url, pinned, "GET");
    } catch { return "uncertain"; }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects === 3) return "uncertain";
      try { url = publicUrl(new URL(response.location, url).toString()); }
      catch { return "uncertain"; }
      continue;
    }
    if (response.status >= 200 && response.status < 300) return "working";
    return response.status === 404 || response.status === 410 ? "hard_failure" : "uncertain";
  }
  return "uncertain";
}

const candidates = await rpc("next_app_website_checks", { p_limit: 80 });
let checked = 0;
let hardFailures = 0;
for (const row of candidates) {
  const result = await probe(row.website_url).catch(() => "uncertain");
  await rpc("record_app_website_check", { p_app_id: row.app_id, p_result: result });
  checked++;
  if (result === "hard_failure") hardFailures++;
}
console.log(`Website health: ${checked} bounded checks, ${hardFailures} hard failures (no single failure hides an app)`);
