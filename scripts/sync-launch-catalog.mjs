import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

const LAUNCH_URL =
  process.env.LAUNCH_SUPABASE_URL || "https://gzpypxgdkxdynovploxn.supabase.co";
const ROCKET_URL =
  process.env.ROCKET_SUPABASE_URL || "https://lcujmvdgczkjxdstzhnr.supabase.co";
const TRACKING_PARAMS =
  /^(utm_.+|ref|referrer|source|campaign|fbclid|gclid|mc_cid|mc_eid)$/i;
const PAGE_SIZE = 100;

function normalizedWebsite(raw) {
  if (!raw || typeof raw !== "string") return null;
  if (!/^https?:\/\//i.test(raw.trim())) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return null;
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    host === "localhost" ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(
      host,
    )
  )
    return null;
  url.hostname = host;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      TRACKING_PARAMS.test(key) ||
      (key === "channel_id" &&
        /^trylaunch/i.test(url.searchParams.get(key) || ""))
    )
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const clean = url.toString();
  return {
    websiteUrl: clean,
    canonicalHost: host,
    identityKey: clean.replace(/\/$/, ""),
  };
}

function publicImage(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

const LAUNCH_MEDIA_PREFIX = `${LAUNCH_URL}/storage/v1/object/public/product-media/`;
function launchMediaRecord(row, order) {
  if (
    !["thumbnail", "screenshot", "video"].includes(row.type) ||
    !row.id ||
    !row.product_id
  )
    return null;
  let parsed;
  try {
    parsed = new URL(row.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (row.type === "video") {
    if (
      !["youtu.be", "youtube.com", "www.youtube.com"].includes(
        parsed.hostname,
      ) ||
      (parsed.hostname !== "youtu.be" && parsed.pathname !== "/watch")
    )
      return null;
  } else if (
    !parsed.toString().startsWith(LAUNCH_MEDIA_PREFIX) ||
    !/\.(png|jpe?g|webp|gif)$/i.test(parsed.pathname)
  )
    return null;
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    type: row.type,
    url: parsed.toString(),
    sort_order: order,
  };
}

async function rest(base, key, path, params = {}) {
  const url = new URL(`${base}/rest/v1/${path}`);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, String(value));
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (response.ok) return response.json();
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
      continue;
    }
    throw new Error(
      `Launch ${path}: HTTP ${response.status} ${await response.text()}`,
    );
  }
  throw new Error(`Launch ${path}: retry limit reached`);
}

async function rocketRpc(key, name, body) {
  const response = await fetch(`${ROCKET_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `Rocket ${name}: HTTP ${response.status} ${await response.text()}`,
    );
  return response.json();
}

async function allLaunchProducts(key) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await rest(LAUNCH_URL, key, "products", {
      select:
        "id,name,slug,tagline,description,domain_url,launch_date,platforms",
      status: "eq.launched",
      order: "id.asc",
      limit: PAGE_SIZE,
      offset,
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  if (rows.length < 4000)
    throw new Error(
      `Launch returned only ${rows.length} launched products; refusing an incomplete sync`,
    );
  return rows;
}

async function relatedRows(key, productIds, table, columns) {
  return rest(LAUNCH_URL, key, table, {
    select: columns,
    product_id: `in.(${productIds.join(",")})`,
    limit: 1000,
  });
}

async function allRelatedMedia(key, productIds) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(LAUNCH_URL, key, "product_media", {
      select: "id,product_id,type,url",
      product_id: `in.(${productIds.join(",")})`,
      order: "id.asc",
      limit: 1000,
      offset,
    });
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result;
}

function byProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.product_id)) map.set(row.product_id, []);
    map.get(row.product_id).push(row);
  }
  return map;
}

function launchVoteRecord(productId, row) {
  const count = (value) => {
    const number = Number(value ?? 0);
    if (!Number.isSafeInteger(number))
      throw new Error(`Invalid public Launch vote count for ${productId}`);
    return Math.min(999999999, Math.max(0, number));
  };
  return {
    launch_id: productId,
    net_votes: count(row?.net_votes),
    total_votes: count(row?.total_votes),
  };
}

function createLaunchRecord(product, enrichment, duplicateCounts) {
  const normalized = normalizedWebsite(product.domain_url);
  if (!normalized || !product.slug || !product.name?.trim()) return null;
  const categories = [
    ...new Set(
      (enrichment.categories || []).map((name) => name.trim()).filter(Boolean),
    ),
  ].sort();
  const tags = [
    ...new Set(
      (enrichment.tags || []).map((name) => name.trim()).filter(Boolean),
    ),
  ].sort();
  const platforms = [
    ...new Set(
      (product.platforms || []).filter((value) => typeof value === "string"),
    ),
  ].sort();
  const record = {
    launch_id: product.id,
    source_url: `https://trylaunch.ai/launch/${encodeURIComponent(product.slug)}`,
    website_url: normalized.websiteUrl,
    canonical_host: normalized.canonicalHost,
    name: product.name.trim().slice(0, 240),
    tagline: product.tagline?.trim() || null,
    description: product.description?.trim() || null,
    logo_url: publicImage(enrichment.icon),
    categories,
    tags,
    platforms,
    launched_at: product.launch_date,
    ambiguous: (duplicateCounts.get(normalized.identityKey) || 0) > 1,
  };
  record.source_hash = createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
  return record;
}

async function run() {
  const launchKey = process.env.LAUNCH_SUPABASE_PUBLISHABLE_KEY;
  if (!launchKey)
    throw new Error("LAUNCH_SUPABASE_PUBLISHABLE_KEY is required");
  const apply = process.argv.includes("--apply");
  const rocketKey = process.env.ROCKET_SUPABASE_SERVICE_ROLE_KEY;
  if (apply && !rocketKey)
    throw new Error("ROCKET_SUPABASE_SERVICE_ROLE_KEY is required for --apply");

  const [products, categoryRows, tagRows] = await Promise.all([
    allLaunchProducts(launchKey),
    rest(LAUNCH_URL, launchKey, "product_categories", {
      select: "id,name",
      limit: 1000,
    }),
    rest(LAUNCH_URL, launchKey, "product_tags", {
      select: "id,name",
      limit: 5000,
    }),
  ]);
  const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));
  const tagNames = new Map(tagRows.map((row) => [row.id, row.name]));
  const duplicates = new Map();
  for (const product of products) {
    const normalized = normalizedWebsite(product.domain_url);
    if (normalized)
      duplicates.set(
        normalized.identityKey,
        (duplicates.get(normalized.identityKey) || 0) + 1,
      );
  }

  const records = [];
  const voteRecords = [];
  const mediaRecords = [];
  for (let offset = 0; offset < products.length; offset += PAGE_SIZE) {
    const page = products.slice(offset, offset + PAGE_SIZE);
    const ids = page.map((product) => product.id);
    const [categoryMapRows, tagMapRows, mediaRows, voteRows] =
      await Promise.all([
        relatedRows(
          launchKey,
          ids,
          "product_category_map",
          "product_id,category_id",
        ),
        relatedRows(launchKey, ids, "product_tag_map", "product_id,tag_id"),
        allRelatedMedia(launchKey, ids),
        relatedRows(
          launchKey,
          ids,
          "product_vote_counts",
          "product_id,net_votes,total_votes",
        ),
      ]);
    const categories = byProduct(categoryMapRows);
    const tags = byProduct(tagMapRows);
    const media = byProduct(mediaRows);
    const votes = new Map(voteRows.map((row) => [row.product_id, row]));
    for (const product of page) {
      const icon = (media.get(product.id) || [])
        .filter((item) => item.type === "icon")
        .sort((a, b) => a.id.localeCompare(b.id))[0]?.url;
      const record = createLaunchRecord(
        product,
        {
          categories: (categories.get(product.id) || [])
            .map((item) => categoryNames.get(item.category_id))
            .filter(Boolean),
          tags: (tags.get(product.id) || [])
            .map((item) => tagNames.get(item.tag_id))
            .filter(Boolean),
          icon,
        },
        duplicates,
      );
      if (record) {
        records.push(record);
        voteRecords.push(launchVoteRecord(product.id, votes.get(product.id)));
        if (!record.ambiguous) {
          const ordered = (media.get(product.id) || []).sort((a, b) =>
            a.id.localeCompare(b.id),
          );
          for (const [index, row] of ordered.entries()) {
            const item = launchMediaRecord(row, index);
            if (item) mediaRecords.push(item);
          }
        }
      }
    }
  }

  const summary = {
    evaluated: products.length,
    valid_public_records: records.length,
    skipped_invalid: products.length - records.length,
    ambiguous_exact_url: records.filter((item) => item.ambiguous).length,
    duplicate_url_groups: [...duplicates.values()].filter((count) => count > 1)
      .length,
    safe_candidates: records.filter((item) => !item.ambiguous).length,
    with_icon: records.filter((item) => item.logo_url).length,
    with_category: records.filter((item) => item.categories.length).length,
    with_positive_launch_votes: voteRecords.filter((item) => item.net_votes > 0)
      .length,
    eligible_media: Object.fromEntries(
      ["thumbnail", "screenshot", "video"].map((type) => [
        type,
        mediaRecords.filter((item) => item.type === type).length,
      ]),
    ),
    largest_duplicate_groups: [...duplicates.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([url, count]) => ({ url, count })),
  };
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }),
  );
  const exportIndex = process.argv.indexOf("--export-dir");
  if (exportIndex !== -1) {
    const directory = process.argv[exportIndex + 1];
    if (!directory || !directory.startsWith("/tmp/"))
      throw new Error("--export-dir requires a /tmp/ path");
    await mkdir(directory, { recursive: true });
    for (let offset = 0; offset < records.length; offset += PAGE_SIZE) {
      await writeFile(
        `${directory}/batch-${String(offset / PAGE_SIZE).padStart(3, "0")}.json`,
        JSON.stringify(records.slice(offset, offset + PAGE_SIZE)),
      );
    }
  }
  if (!apply) return;

  const runId = await rocketRpc(rocketKey, "start_launch_app_import", {
    p_expected_count: records.length,
  });
  try {
    for (let offset = 0; offset < records.length; offset += PAGE_SIZE) {
      await rocketRpc(rocketKey, "sync_launch_app_batch", {
        p_run_id: runId,
        p_items: records.slice(offset, offset + PAGE_SIZE),
      });
      console.log(
        `Synced ${Math.min(offset + PAGE_SIZE, records.length)}/${records.length}`,
      );
    }
    const completed = await rocketRpc(rocketKey, "finish_launch_app_import", {
      p_run_id: runId,
    });
    console.log(JSON.stringify({ run_id: runId, completed }));
  } catch (error) {
    console.error(
      `Import ${runId} remains incomplete and cannot withdraw old records.`,
    );
    try {
      await rocketRpc(rocketKey, "fail_launch_app_import", {
        p_run_id: runId,
        p_error: String(error).slice(0, 500),
      });
    } catch {
      console.error(
        `Unable to close failed import ${runId}; it will time out after two hours.`,
      );
    }
    throw error;
  }
  let mediaUpdates = 0;
  for (let offset = 0; offset < mediaRecords.length; offset += PAGE_SIZE) {
    mediaUpdates += await rocketRpc(rocketKey, "sync_launch_app_media_batch", {
      p_items: mediaRecords.slice(offset, offset + PAGE_SIZE),
    });
  }
  console.log(JSON.stringify({ media_updates: mediaUpdates }));
  // A vote/derived refresh failure leaves the catalogue and the last successful
  // intelligence snapshot intact; the next daily run can retry it safely.
  let voteUpdates = 0;
  for (let offset = 0; offset < voteRecords.length; offset += PAGE_SIZE) {
    voteUpdates += await rocketRpc(rocketKey, "sync_launch_vote_counts", {
      p_items: voteRecords.slice(offset, offset + PAGE_SIZE),
    });
  }
  const intelligence = await rocketRpc(
    rocketKey,
    "refresh_launch_intelligence",
    {},
  );
  console.log(JSON.stringify({ vote_updates: voteUpdates, intelligence }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  normalizedWebsite,
  createLaunchRecord,
  launchVoteRecord,
  launchMediaRecord,
};
