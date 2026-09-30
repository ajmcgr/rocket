import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import {
  classifySource,
  extractHtml,
  fetchPublicBytes,
  normalizeSourceUrl,
  parsePublicUrl,
} from "../_shared/appIngestion.ts";
import { geminiText, hasGeminiKey } from "../_shared/gemini.ts";

const origin = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(origin, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(origin, Deno.env.get("SUPABASE_ANON_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function loggedIn(req: Request) {
  const token = req.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to continue");
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous)
    throw new Error("Sign in to continue");
  return data.user;
}

type Extracted = {
  sourceType: "website" | "launch" | "github" | "hacker_news";
  externalId: string;
  sourceUrl: string;
  normalizedSourceUrl: string;
  websiteUrl: string;
  name: string;
  description: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  evidence: Record<string, unknown>;
};

async function extract(raw: string): Promise<Extracted> {
  const parsed = parsePublicUrl(raw);
  const sourceType = classifySource(parsed);
  if (sourceType === "unsupported")
    throw new Error(
      "This source needs a canonical product website. Paste that website URL instead.",
    );
  const normalizedSourceUrl = normalizeSourceUrl(raw);
  const now = new Date().toISOString();
  if (sourceType === "github") {
    const [, owner, repo] = parsed.pathname.split("/");
    const api = await fetchPublicBytes(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      150_000,
    );
    const data = JSON.parse(new TextDecoder().decode(api.bytes));
    if (!data.homepage)
      throw new Error(
        "This repository has no product website. Paste its canonical website URL instead.",
      );
    const websiteUrl = parsePublicUrl(data.homepage).toString();
    return {
      sourceType,
      externalId: `${owner.toLowerCase()}/${repo.toLowerCase()}`,
      sourceUrl: parsed.toString(),
      normalizedSourceUrl,
      websiteUrl,
      name: text(data.name, 240) || repo,
      description: text(data.description, 2000),
      imageUrl: null,
      faviconUrl: null,
      evidence: {
        observed_at: now,
        fields: {
          name: { source: api.url, method: "github_api" },
          description: { source: api.url, method: "github_api" },
          website_url: { source: api.url, method: "github_api" },
        },
      },
    };
  }
  if (sourceType === "hacker_news") {
    const id = parsed.searchParams.get("id")!;
    const api = await fetchPublicBytes(
      `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
      80_000,
    );
    const data = JSON.parse(new TextDecoder().decode(api.bytes));
    if (!data || data.id !== Number(id) || !data.url)
      throw new Error("This HN item does not link to a public product website");
    return {
      sourceType,
      externalId: id,
      sourceUrl: parsed.toString(),
      normalizedSourceUrl,
      websiteUrl: parsePublicUrl(data.url).toString(),
      name: text(data.title, 240),
      description: "",
      imageUrl: null,
      faviconUrl: null,
      evidence: {
        observed_at: now,
        item_date: data.time ? new Date(data.time * 1000).toISOString() : null,
        fields: {
          name: { source: api.url, method: "hn_api" },
          website_url: { source: api.url, method: "hn_api" },
        },
      },
    };
  }
  const page = await fetchPublicBytes(parsed.toString());
  if (
    page.contentType !== "text/html" &&
    page.contentType !== "application/xhtml+xml"
  )
    throw new Error("This URL is not a public HTML page");
  const meta = extractHtml(new TextDecoder().decode(page.bytes), page.url);
  if (!meta.name)
    throw new Error("Could not identify an app name from the public page");
  let websiteUrl = meta.canonicalUrl;
  if (sourceType === "launch") {
    // A Launch page must identify a separate canonical product website.
    const linked = meta.jsonLd.find(
      (item) =>
        typeof item.url === "string" &&
        !String(item.url).includes("trylaunch.ai"),
    );
    if (!linked)
      throw new Error(
        "This Launch page does not expose a canonical product website. Paste the website URL instead.",
      );
    websiteUrl = parsePublicUrl(String(linked.url)).toString();
  } else if (
    parsePublicUrl(websiteUrl).hostname.replace(/^www\./, "") !==
    new URL(page.url).hostname.replace(/^www\./, "")
  ) {
    // An arbitrary page cannot nominate another site's identity by canonical tag.
    websiteUrl = page.url;
  }
  return {
    sourceType,
    externalId:
      sourceType === "launch"
        ? parsed.pathname.split("/")[2]
        : normalizeSourceUrl(page.url),
    sourceUrl: parsed.toString(),
    normalizedSourceUrl,
    websiteUrl,
    name: meta.name,
    description: meta.description,
    imageUrl: meta.imageUrl,
    faviconUrl: meta.faviconUrl,
    evidence: {
      observed_at: now,
      fields: {
        name: { source: page.url, method: "html_metadata" },
        description: { source: page.url, method: "html_metadata" },
        website_url: { source: page.url, method: "canonical_link_or_redirect" },
        image_url: { source: page.url, method: "og_image_or_favicon" },
      },
      pricing_url: meta.pricingUrl,
      structured_data: meta.jsonLd,
    },
  };
}

async function storeSmallImage(
  image: string | null,
  fallback: string | null,
): Promise<string | null> {
  for (const candidate of [image, fallback]) {
    if (!candidate) continue;
    try {
      const file = await fetchPublicBytes(candidate, 120_000);
      const b = file.bytes;
      const png =
        b.length > 8 &&
        b[0] === 137 &&
        b[1] === 80 &&
        b[2] === 78 &&
        b[3] === 71;
      const jpg = b.length > 3 && b[0] === 255 && b[1] === 216;
      const webp =
        b.length > 12 &&
        new TextDecoder().decode(b.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(b.slice(8, 12)) === "WEBP";
      if (!(png || jpg || webp)) continue;
      const mime = png ? "image/png" : jpg ? "image/jpeg" : "image/webp";
      if (file.contentType && file.contentType !== mime) continue;
      const path = `app-previews/${crypto.randomUUID()}.${png ? "png" : jpg ? "jpg" : "webp"}`;
      const uploaded = await admin.storage
        .from("rocket-images")
        .upload(path, b, { contentType: mime, upsert: false });
      if (uploaded.error) continue;
      return admin.storage.from("rocket-images").getPublicUrl(path).data
        .publicUrl;
    } catch {
      /* source artwork is optional */
    }
  }
  return null;
}

async function submit(userId: string, raw: string) {
  const parsed = parsePublicUrl(raw);
  const sourceType = classifySource(parsed);
  if (sourceType === "unsupported")
    throw new Error("Paste the app's own public website URL instead");
  const normalized = normalizeSourceUrl(raw);
  const existing = await admin
    .from("app_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_url", normalized)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (
    existing.data &&
    [
      "complete",
      "needs_review",
      "fetching",
      "extracting",
      "resolving",
    ].includes(existing.data.status)
  )
    return existing.data;
  let job = existing.data;
  if (!job) {
    const inserted = await admin
      .from("app_jobs")
      .insert({
        user_id: userId,
        submitted_url: raw,
        normalized_url: normalized,
        source_type: sourceType,
      })
      .select("*")
      .single();
    if (inserted.error) {
      const retry = await admin
        .from("app_jobs")
        .select("*")
        .eq("user_id", userId)
        .eq("normalized_url", normalized)
        .single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    job = inserted.data;
  }
  const setStatus = async (status: string, error?: string) => {
    const result = await admin
      .from("app_jobs")
      .update({
        status,
        error: error || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", userId);
    if (result.error) throw result.error;
  };
  try {
    await setStatus("fetching");
    // Existing Launch provenance is authoritative. Never re-ingest its page.
    if (sourceType === "launch") {
      const found = await admin
        .from("public_apps")
        .select("*")
        .eq("launch_url", parsed.toString())
        .maybeSingle();
      if (found.data) {
        await admin
          .from("app_jobs")
          .update({
            status: "complete",
            app_id: found.data.id,
            result: { outcome: "existing", app_id: found.data.id },
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        return {
          ...job,
          status: "complete",
          app_id: found.data.id,
          result: { outcome: "existing", app_id: found.data.id },
        };
      }
    }
    const item = await extract(raw);
    await setStatus("extracting");
    const canonical = parsePublicUrl(item.websiteUrl);
    const websiteUrl = normalizeSourceUrl(canonical.toString());
    const logoUrl = await storeSmallImage(item.imageUrl, item.faviconUrl);
    await setStatus("resolving");
    const resolved = await admin.rpc("resolve_app_submission", {
      p_user_id: userId,
      p_job_id: job.id,
      p_source_type: item.sourceType,
      p_external_id: item.externalId,
      p_source_url: item.sourceUrl,
      p_normalized_source_url: item.normalizedSourceUrl,
      p_website_url: websiteUrl,
      p_canonical_host: canonical.hostname.replace(/^www\./, ""),
      p_name: item.name,
      p_description: item.description,
      p_logo_url: logoUrl,
      p_public_evidence: item.evidence,
    });
    if (resolved.error) throw resolved.error;
    const latest = await admin
      .from("app_jobs")
      .select("*")
      .eq("id", job.id)
      .single();
    if (latest.error) throw latest.error;
    return latest.data;
  } catch (error) {
    await setStatus("failed", (error as Error).message.slice(0, 300));
    throw error;
  }
}

const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

async function preview(req: Request, body: Record<string, unknown>) {
  const raw = text(body.url, 2048);
  const parsed = parsePublicUrl(raw);
  // A caller can prepend X-Forwarded-For entries. Use the gateway's trailing
  // address (or a shared fallback) so omitting/spoofing the header cannot
  // disable the anonymous extraction budget entirely.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",") || [];
  const clientAddress =
    req.headers.get("cf-connecting-ip") ||
    forwarded.at(-1)?.trim() ||
    "unknown";
  {
    const clientHash = await digest(
      `${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}:${clientAddress}`,
    );
    const recent = await admin
      .from("app_preview_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_hash", clientHash)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if (recent.error) throw recent.error;
    if ((recent.count || 0) >= 20)
      throw new Error("Too many previews. Please try later.");
    const attempted = await admin
      .from("app_preview_attempts")
      .insert({ client_hash: clientHash });
    if (attempted.error) throw attempted.error;
  }
  const manual = body.manual === true;
  const selectedCategory = text(body.category, 80);
  if (selectedCategory && !/^[\p{L}\p{N} &-]{2,80}$/u.test(selectedCategory))
    throw new Error("Choose a valid category");
  let item: Extracted | null = null;
  let name = "";
  let description = "";
  let logoUrl: string | null = null;
  let category: string | null = null;
  let websiteUrl = parsed.toString();
  if (manual) {
    if (classifySource(parsed) !== "website")
      throw new Error("Manual entry requires the app's own website");
    name = text(body.name, 240);
    description = text(body.description, 2000);
    if (name.length < 2 || description.length < 20)
      throw new Error("Add a name and a short description");
    category = selectedCategory || null;
    const candidate = text(body.logo_url, 2048);
    if (candidate) {
      const logo = parsePublicUrl(candidate);
      if (logo.hostname !== parsed.hostname)
        throw new Error("Logo must come from the app website");
      logoUrl = logo.toString();
    }
  } else {
    const knownLaunch =
      classifySource(parsed) === "launch"
        ? await admin
            .from("public_apps")
            .select("id,name,description,website_url,logo_url,categories")
            .eq("launch_url", parsed.toString())
            .maybeSingle()
        : null;
    if (knownLaunch?.data) {
      name = knownLaunch.data.name;
      description = knownLaunch.data.description || "";
      websiteUrl = knownLaunch.data.website_url;
      logoUrl = knownLaunch.data.logo_url;
      category = knownLaunch.data.categories[0] || null;
    } else {
      item = await extract(raw);
      name = item.name;
      description = item.description;
      websiteUrl = item.websiteUrl;
      logoUrl = item.imageUrl || item.faviconUrl;
      // AI structures only observed public text. It cannot choose identity or
      // provide unobserved revenue, pricing or trust claims.
      if (hasGeminiKey() && description.length >= 80) {
        try {
          const answer = JSON.parse(
            await geminiText({
              system:
                'Choose one broad category for this software from the given page metadata. Return JSON {"category": string}. Do not invent facts or change the app identity.',
              user: JSON.stringify({ name, description }),
              json: true,
              temperature: 0,
            }),
          );
          if (
            typeof answer.category === "string" &&
            /^[\p{L}\p{N} &-]{2,60}$/u.test(answer.category)
          )
            category = answer.category;
        } catch {
          /* deterministic metadata remains the source of truth */
        }
      }
    }
  }
  // A founder's explicit choice takes precedence over an AI suggestion for a
  // new app. Existing canonical app categories are never changed by preview.
  if (!manual && selectedCategory) category = selectedCategory;
  const normalized = normalizeSourceUrl(websiteUrl);
  const canonicalHost = parsePublicUrl(normalized).hostname.replace(
    /^www\./,
    "",
  );
  const exactMatches = await admin
    .from("public_apps")
    .select("id,name,description,website_url,logo_url,categories")
    .eq("website_url", normalized)
    .limit(3);
  if (exactMatches.error) throw exactMatches.error;
  const hostMatches = exactMatches.data?.length ? exactMatches : await admin
    .from("public_apps")
    .select("id,name,description,website_url,logo_url,categories")
    .eq("canonical_host", canonicalHost)
    .limit(3);
  if (hostMatches.error) throw hostMatches.error;
  const exact = hostMatches.data || [];
  const outcome =
    exact.length === 1 ? "existing" : exact.length > 1 ? "ambiguous" : "new";
  const display =
    exact.length === 1
      ? exact[0]
      : {
          name,
          description,
          website_url: normalized,
          logo_url: logoUrl,
          categories: category ? [category] : [],
        };
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const saved = await admin.from("pending_app_previews").insert({
    token_hash: await digest(token),
    submitted_url: raw,
    manual,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    preview: {
      outcome,
      name: display.name,
      description: display.description,
      website_url: display.website_url,
      logo_url: display.logo_url,
      categories: display.categories,
      existing_app_id: exact.length === 1 ? exact[0].id : null,
    },
  });
  if (saved.error) throw saved.error;
  return {
    token,
    manual,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    outcome,
    app: {
      name: display.name,
      description: display.description,
      website_url: display.website_url,
      logo_url: display.logo_url,
      categories: display.categories,
    },
  };
}

async function consumePreview(userId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error("Invalid preview");
  const hashed = await digest(token);
  const pending = await admin
    .from("pending_app_previews")
    .select("*")
    .eq("token_hash", hashed)
    .maybeSingle();
  if (
    pending.error ||
    !pending.data ||
    pending.data.consumed_at ||
    new Date(pending.data.expires_at).getTime() <= Date.now()
  )
    throw new Error("Preview expired. Please submit the URL again.");
  const claimed = await admin
    .from("pending_app_previews")
    .update({ consumed_at: new Date().toISOString(), consumed_by: userId })
    .eq("token_hash", hashed)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (claimed.error || !claimed.data)
    throw new Error("Preview was already used");
  try {
    let result;
    if (!pending.data.manual)
      result = await submit(userId, pending.data.submitted_url);
    else {
      const fields = pending.data.preview as {
        name: string;
        description: string;
        website_url: string;
        logo_url: string | null;
      };
      const website = parsePublicUrl(fields.website_url);
      const normalized = normalizeSourceUrl(website.toString());
      const existing = await admin
        .from("app_jobs")
        .select("id,status,app_id,result")
        .eq("user_id", userId)
        .eq("normalized_url", normalized)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "complete") result = existing.data;
      else {
        const job =
          existing.data ||
          (
            await admin
              .from("app_jobs")
              .insert({
                user_id: userId,
                submitted_url: pending.data.submitted_url,
                normalized_url: normalized,
                source_type: "website",
              })
              .select("id")
              .single()
          ).data;
        if (!job) throw new Error("Could not create app submission");
        const resolved = await admin.rpc("resolve_app_submission", {
          p_user_id: userId,
          p_job_id: job.id,
          p_source_type: "website",
          p_external_id: normalized,
          p_source_url: normalized,
          p_normalized_source_url: normalized,
          p_website_url: normalized,
          p_canonical_host: website.hostname.replace(/^www\./, ""),
          p_name: fields.name,
          p_description: fields.description,
          p_logo_url: await storeSmallImage(fields.logo_url, null),
          p_public_evidence: {
            source: "founder_manual_entry",
            observed_at: new Date().toISOString(),
          },
        });
        if (resolved.error) throw resolved.error;
        const latest = await admin
          .from("app_jobs")
          .select("*")
          .eq("id", job.id)
          .single();
        if (latest.error) throw latest.error;
        result = latest.data;
      }
    }
    const previewFields = pending.data.preview as { categories?: unknown };
    const firstCategory = Array.isArray(previewFields.categories)
      ? text(previewFields.categories[0], 80)
      : "";
    if (
      result?.status === "complete" &&
      result?.result?.outcome === "new" &&
      result.app_id &&
      firstCategory
    ) {
      const categorized = await admin.rpc("set_new_submission_category", {
        p_user_id: userId,
        p_app_id: result.app_id,
        p_category: firstCategory,
      });
      if (categorized.error) throw categorized.error;
    }
    return result;
  } catch (error) {
    await admin
      .from("pending_app_previews")
      .update({ consumed_at: null, consumed_by: null })
      .eq("token_hash", hashed)
      .eq("consumed_by", userId);
    throw error;
  }
}

async function claim(userId: string, appId: string, method: string) {
  if (!/^[0-9a-f-]{36}$/i.test(appId)) throw new Error("Invalid app");
  if (!["dns_txt", "https_well_known", "manual_review"].includes(method))
    throw new Error("Invalid verification method");
  const [publicApp, ownJob, owner] = await Promise.all([
    admin
      .from("public_apps")
      .select("id,canonical_host,claim_state")
      .eq("id", appId)
      .maybeSingle(),
    admin
      .from("app_jobs")
      .select("id,result")
      .eq("app_id", appId)
      .eq("user_id", userId)
      .eq("status", "complete")
      .maybeSingle(),
    admin
      .from("app_owners")
      .select("user_id,revoked_at")
      .eq("app_id", appId)
      .maybeSingle(),
  ]);
  if (publicApp.error || ownJob.error || owner.error)
    throw new Error("Could not inspect app claim");
  if (!publicApp.data && !ownJob.data)
    throw new Error("App is not available to claim");
  const ownWebsite = ownJob.data?.result?.website_url;
  const hostname =
    publicApp.data?.canonical_host ||
    (typeof ownWebsite === "string"
      ? parsePublicUrl(ownWebsite).hostname.replace(/^www\./, "")
      : "");
  if (!hostname) throw new Error("This submission has no verifiable website");
  const sharedStoreHost =
    hostname === "apps.apple.com" || hostname === "play.google.com";
  if (owner.data && !owner.data.revoked_at && owner.data.user_id === userId)
    return { status: "verified", reason: "You already own this app." };
  const conflict =
    owner.data && !owner.data.revoked_at && owner.data.user_id !== userId;
  const current = await admin
    .from("app_claims")
    .select("id,status")
    .eq("app_id", appId)
    .eq("user_id", userId)
    .eq("method", method)
    .maybeSingle();
  if (current.error) throw current.error;
  if (current.data?.status === "verified")
    return { status: "verified", reason: "This claim is already verified." };
  const status =
    conflict || method === "manual_review" || sharedStoreHost
      ? "review"
      : "pending";
  const inserted = await admin
    .from("app_claims")
    .upsert(
      {
        app_id: appId,
        user_id: userId,
        method,
        status,
        review_reason: conflict ? "Existing owner conflict" : null,
      },
      { onConflict: "app_id,user_id,method" },
    )
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  if (status === "review")
    return {
      claim_id: inserted.data.id,
      status,
      reason: conflict
        ? "This app has already been claimed. Ownership review is required."
        : sharedStoreHost
          ? "Apple and Google own this store domain. Add your own app website or request ownership review."
          : "Manual review requested.",
    };
  await admin
    .from("app_verification_challenges")
    .update({ status: "expired" })
    .eq("claim_id", inserted.data.id)
    .eq("status", "pending");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const challenge = await admin
    .from("app_verification_challenges")
    .insert({
      claim_id: inserted.data.id,
      app_id: appId,
      user_id: userId,
      method,
      hostname,
      token_hash: hash,
      expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
    })
    .select("id,expires_at")
    .single();
  if (challenge.error) throw challenge.error;
  return {
    claim_id: inserted.data.id,
    challenge_id: challenge.data.id,
    status,
    method,
    host:
      method === "dns_txt"
        ? `_rocket-verify.${hostname}`
        : `https://${hostname}/.well-known/rocket-verification.txt`,
    value: `rocket-verification=${token}`,
    token,
    expires_at: challenge.data.expires_at,
  };
}

async function verify(userId: string, challengeId: string, token: string) {
  if (
    !/^[0-9a-f-]{36}$/i.test(challengeId) ||
    !/^[A-Za-z0-9_-]{40,60}$/.test(token)
  )
    throw new Error("Invalid verification request");
  const item = await admin
    .from("app_verification_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .single();
  if (
    item.error ||
    !item.data ||
    item.data.status !== "pending" ||
    new Date(item.data.expires_at).getTime() <= Date.now()
  )
    throw new Error("Verification challenge is invalid or expired");
  const expected = `rocket-verification=${token}`;
  if (item.data.method === "dns_txt") {
    const records = await Deno.resolveDns(
      `_rocket-verify.${item.data.hostname}`,
      "TXT",
    );
    if (!records.some((parts) => parts.join("") === expected))
      throw new Error("The required DNS TXT record was not found");
  } else {
    const response = await fetchPublicBytes(
      `https://${item.data.hostname}/.well-known/rocket-verification.txt`,
      4096,
    );
    if (
      !response.contentType.startsWith("text/") ||
      new TextDecoder().decode(response.bytes).trim() !== expected
    )
      throw new Error(
        "The verification file does not contain the expected value",
      );
  }
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const finished = await admin.rpc("complete_app_domain_verification", {
    p_challenge_id: challengeId,
    p_user_id: userId,
    p_token_hash: hash,
  });
  if (finished.error) throw finished.error;
  return finished.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("Invalid request");
    if (body.action === "preview") return json(await preview(req, body));
    const user = await loggedIn(req);
    switch (body.action) {
      case "consume_preview":
        return json(await consumePreview(user.id, text(body.token, 100)));
      case "update_presentation": {
        const appId = text(body.app_id, 36);
        if (!/^[0-9a-f-]{36}$/i.test(appId)) throw new Error("Invalid app");
        const owner = await admin
          .from("app_owners")
          .select("verification_level")
          .eq("app_id", appId)
          .eq("user_id", user.id)
          .is("revoked_at", null)
          .maybeSingle();
        if (owner.error || owner.data?.verification_level !== "domain_verified")
          throw new Error("Domain-verified app ownership is required");
        const app = await admin
          .from("public_apps")
          .select("canonical_host")
          .eq("id", appId)
          .maybeSingle();
        if (app.error || !app.data) throw new Error("App not found");
        const displayName = text(body.name, 121);
        const description = text(body.description, 2001);
        const category = text(body.category, 81);
        const pricing = text(body.pricing_display, 61);
        if (
          displayName.length < 2 ||
          displayName.length > 120 ||
          description.length < 20 ||
          description.length > 2000 ||
          category.length > 80 ||
          pricing.length > 60
        )
          throw new Error("Invalid presentation fields");
        const links = Array.isArray(body.public_links) ? body.public_links : [];
        if (
          links.length > 5 ||
          links.some(
            (value) => typeof value !== "string" || value.length > 2048,
          )
        )
          throw new Error("Too many public links");
        const safeLinks = links.map((value: string) =>
          parsePublicUrl(value).toString(),
        );
        const logo = text(body.logo_url, 2048);
        const host = app.data.canonical_host;
        const checkImage = async (candidate: string) => {
          const parsed = parsePublicUrl(candidate);
          if (
            parsed.hostname.replace(/^www\./, "") !== host &&
            !candidate.startsWith(
              `${origin}/storage/v1/object/public/rocket-images/`,
            )
          )
            throw new Error(
              "Images must come from the app website or Rocket storage",
            );
          const fetched = await fetchPublicBytes(candidate, 2_000_000);
          const bytes = fetched.bytes;
          const png =
            bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71;
          const jpg = bytes[0] === 255 && bytes[1] === 216;
          const webp =
            new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
            new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
          if (!(png || jpg || webp))
            throw new Error("Image must be PNG, JPEG or WebP");
          if (
            new URL(fetched.url).hostname.replace(/^www\./, "") !== host &&
            !fetched.url.startsWith(
              `${origin}/storage/v1/object/public/rocket-images/`,
            )
          )
            throw new Error("Image redirected away from the app website");
          return fetched.url;
        };
        const logoUrl = logo ? await checkImage(logo) : null;
        const media = Array.isArray(body.media) ? body.media : [];
        if (media.length > 8) throw new Error("Too many images");
        const validatedMedia = [];
        for (const item of media) {
          if (
            !item ||
            typeof item !== "object" ||
            !["thumbnail", "screenshot"].includes(item.type)
          )
            throw new Error("Invalid media item");
          validatedMedia.push({
            type: item.type,
            url: await checkImage(text(item.url, 2048)),
          });
        }
        const updated = await admin.from("app_owner_presentations").upsert(
          {
            app_id: appId,
            display_name: displayName,
            description,
            category: category || null,
            logo_url: logoUrl,
            pricing_display: pricing || null,
            public_links: safeLinks,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "app_id" },
        );
        if (updated.error) throw updated.error;
        if (Array.isArray(body.media)) {
          const synced = await admin.rpc("replace_owner_app_media", {
            p_app_id: appId,
            p_items: validatedMedia,
          });
          if (synced.error) throw synced.error;
        }
        return json({ status: "saved" });
      }
      case "submit":
        return json(await submit(user.id, text(body.url, 2048)));
      case "claim":
        return json(
          await claim(user.id, text(body.app_id, 36), text(body.method, 30)),
        );
      case "verify":
        return json(
          await verify(
            user.id,
            text(body.challenge_id, 36),
            text(body.token, 60),
          ),
        );
      case "add_source": {
        const appId = text(body.app_id, 36);
        if (!/^[0-9a-f-]{36}$/i.test(appId)) throw new Error("Invalid app");
        const item = await extract(text(body.url, 2048));
        const result = await admin.rpc("attach_verified_app_source", {
          p_user_id: user.id,
          p_app_id: appId,
          p_source_type: item.sourceType,
          p_external_id: item.externalId,
          p_source_url: item.sourceUrl,
          p_normalized_source_url: item.normalizedSourceUrl,
          p_website_url: normalizeSourceUrl(item.websiteUrl),
          p_public_evidence: item.evidence,
        });
        if (result.error) throw result.error;
        return json(result.data);
      }
      case "my_apps": {
        const claims = await admin
          .from("app_claims")
          .select("id,app_id,status,method,verification_state,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (claims.error) throw claims.error;
        const ids = [...new Set((claims.data || []).map((c) => c.app_id))];
        const visible = ids.length
          ? await admin
              .from("public_apps")
              .select("id,name,website_url,logo_url,claim_state")
              .in("id", ids)
          : { data: [], error: null };
        if (visible.error) throw visible.error;
        const owners = ids.length
          ? await admin
              .from("app_owners")
              .select("app_id,verification_level")
              .eq("user_id", user.id)
              .is("revoked_at", null)
              .in("app_id", ids)
          : { data: [], error: null };
        if (owners.error) throw owners.error;
        const jobs = ids.length
          ? await admin
              .from("app_jobs")
              .select("app_id,result")
              .eq("user_id", user.id)
              .in("app_id", ids)
          : { data: [], error: null };
        if (jobs.error) throw jobs.error;
        const byApp = new Map<
          string,
          NonNullable<typeof claims.data>[number]
        >();
        const priority = (status: string) =>
          status === "verified"
            ? 3
            : status === "review"
              ? 2
              : status === "pending"
                ? 1
                : 0;
        for (const entry of claims.data || []) {
          const previous = byApp.get(entry.app_id);
          if (!previous || priority(entry.status) > priority(previous.status))
            byApp.set(entry.app_id, entry);
        }
        return json(
          [...byApp.values()].map((c) => ({
            ...c,
            owned: (owners.data || []).some((o) => o.app_id === c.app_id),
            owner_verification_level:
              (owners.data || []).find((o) => o.app_id === c.app_id)
                ?.verification_level || null,
            app:
              visible.data?.find((a) => a.id === c.app_id) ||
              jobs.data?.find((j) => j.app_id === c.app_id)?.result ||
              null,
          })),
        );
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    const message = (error as Error).message || "Request failed";
    return json(
      { error: message },
      message === "Sign in to continue" ? 401 : 400,
    );
  }
});
