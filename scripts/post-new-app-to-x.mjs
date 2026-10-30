import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const rocketOrigin = "https://lcujmvdgczkjxdstzhnr.supabase.co";
const xOrigin = "https://api.x.com";
const expectedXUsername = "tryrocketai";

const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export function oauthHeader(method, url, credentials, now = new Date(), nonce = randomBytes(16).toString("hex")) {
  const parameters = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(now.getTime() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };
  const parsed = new URL(url);
  const signed = [...Object.entries(parameters), ...parsed.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([aKey, aValue], [bKey, bValue]) => aKey < bKey ? -1 : aKey > bKey ? 1 : aValue < bValue ? -1 : aValue > bValue ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const base = `${method.toUpperCase()}&${encode(parsed.origin + parsed.pathname)}&${encode(signed)}`;
  const signingKey = `${encode(credentials.apiSecret)}&${encode(credentials.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");
  return `OAuth ${[...Object.entries(parameters), ["oauth_signature", signature]]
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`).join(", ")}`;
}

export function composeAppPost(app) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug || "")) throw new Error("Invalid public app slug");
  const clean = (value, max) => Array.from(String(value || "")
    .replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("");
  const name = clean(app.name, 50);
  const tagline = clean(app.tagline, 60);
  if (!name || !tagline) throw new Error("Incomplete public app details");
  return `New on Rocket: ${name}\n\n${tagline}\n\nhttps://tryrocket.ai/apps/${app.slug}`;
}

export async function postNewAppToX({ dbKey, credentials, dryRun = true, request = fetch, now = new Date() }) {
  if (!dbKey || dbKey.length < 32) throw new Error("Rocket service credential is missing");
  if (!credentials || Object.values(credentials).some((value) => !value)) {
    throw new Error("Rocket X write credentials are missing");
  }
  const dbHeaders = { apikey: dbKey, Authorization: `Bearer ${dbKey}`, "Content-Type": "application/json" };
  async function db(path, method = "GET", body) {
    const response = await request(rocketOrigin + path, {
      method, headers: { ...dbHeaders, ...(method === "PATCH" ? { Prefer: "return=representation" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Rocket posting ledger failed (${response.status}); stopped`);
    return response.status === 204 ? null : response.json();
  }
  async function x(path, method = "GET", body) {
    const url = xOrigin + path;
    const response = await request(url, {
      method,
      headers: {
        Authorization: oauthHeader(method, url, credentials, now),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`X API request failed (${response.status}); stopped without retry`);
    return response.json();
  }

  const account = await x("/2/users/me");
  if (account?.data?.username?.toLowerCase() !== expectedXUsername) {
    throw new Error("X credential does not belong to Rocket's @tryrocketai account");
  }
  const control = await db("/rest/v1/rocket_x_posting_control?id=eq.true&select=start_at");
  if (!Array.isArray(control) || control.length !== 1) throw new Error("Rocket posting ledger is not configured");
  if (dryRun) return { dryRun: true, account: expectedXUsername, posted: 0 };

  // The reservation is committed before contacting X. An uncertain X response
  // must be reconciled manually instead of being retried and possibly reposted.
  const reserved = await db("/rest/v1/rpc/rocket_x_reserve_next_app", "POST", {});
  if (!Array.isArray(reserved) || reserved.length === 0) return { dryRun: false, posted: 0, reason: "No eligible new app or today's slot is used" };
  if (reserved.length !== 1) throw new Error("Invalid Rocket posting reservation");
  const app = reserved[0];
  const text = composeAppPost(app);
  const result = await x("/2/tweets", "POST", { text });
  const postId = result?.data?.id;
  if (!/^\d+$/.test(postId || "")) throw new Error("X did not confirm a post ID; reservation requires manual review");
  const finalized = await db(`/rest/v1/rocket_x_app_posts?app_id=eq.${encodeURIComponent(app.app_id)}&status=eq.reserved`, "PATCH", {
    status: "posted", x_post_id: postId, post_text: text, posted_at: new Date().toISOString(),
  });
  if (!Array.isArray(finalized) || finalized.length !== 1) throw new Error("X posted, but the Rocket ledger was not finalized; reconcile manually");
  return { dryRun: false, posted: 1, appId: app.app_id, xPostUrl: `https://x.com/${expectedXUsername}/status/${postId}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await postNewAppToX({
      dbKey: process.env.ROCKET_SUPABASE_SERVICE_ROLE_KEY,
      credentials: {
        apiKey: process.env.ROCKET_X_API_KEY,
        apiSecret: process.env.ROCKET_X_API_SECRET,
        accessToken: process.env.ROCKET_X_ACCESS_TOKEN,
        accessTokenSecret: process.env.ROCKET_X_ACCESS_TOKEN_SECRET,
      },
      dryRun: process.env.ROCKET_X_DRY_RUN !== "false",
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
