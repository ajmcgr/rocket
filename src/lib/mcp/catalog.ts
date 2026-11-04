// Rocket's anonymous, read-only catalogue adapter. Never use a service-role key here.
const rocketUrl = "https://tryrocket.ai";
const requestTimeoutMs = 8_000;
const maxUpstreamBytes = 200_000;

export type PublicApp = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string;
  categories: string[];
  platforms: string[];
  launched_at: string | null;
};

export function appProfileUrl(slug: string) {
  const url = new URL(`/apps/${encodeURIComponent(slug)}`, rocketUrl);
  url.searchParams.set("utm_source", "rocket_mcp");
  return url.toString();
}

export function boundedLimit(value: number | undefined) {
  if (value === undefined) return 8;
  if (!Number.isInteger(value) || value < 1 || value > 10)
    throw new Error("limit must be an integer from 1 to 10");
  return value;
}

export function boundedText(value: string, name: string, max = 80) {
  const clean = value.trim();
  if (clean.length > max || /[\x00-\x1f\x7f]/.test(clean))
    throw new Error(`${name} must be at most ${max} printable characters`);
  return clean;
}

export function publicApp(app: PublicApp, rating?: { average_rating: number; rating_count: number }) {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name.slice(0, 160),
    description: (app.tagline || app.description || "").slice(0, 500),
    categories: app.categories.slice(0, 10),
    website: app.website_url,
    rocket_profile_url: appProfileUrl(app.slug),
    ...(rating?.rating_count ? { public_rating: { average: rating.average_rating, count: rating.rating_count } } : {}),
  };
}

export class PublicCatalogue {
  constructor(
    private readonly baseUrl: string,
    private readonly publishableKey: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async read(path: string, params?: URLSearchParams, body?: object): Promise<unknown> {
    const url = new URL(`/rest/v1/${path}`, this.baseUrl);
    if (params) url.search = params.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await this.fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${this.publishableKey}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Public catalogue unavailable (${response.status})`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Public catalogue response unavailable");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxUpstreamBytes) {
          await reader.cancel();
          throw new Error("Public catalogue response exceeded limit");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ratings(ids: string[]) {
    if (!ids.length) return new Map<string, { average_rating: number; rating_count: number }>();
    const params = new URLSearchParams({
      select: "app_id,average_rating,rating_count",
      app_id: `in.(${ids.join(",")})`,
      limit: "10",
    });
    const rows = await this.read("public_app_review_summary", params) as Array<{ app_id: string; average_rating: number; rating_count: number }>;
    return new Map(rows.map(({ app_id, ...rating }) => [app_id, rating]));
  }

  async search(query: string, category = "", limit?: number) {
    const safeQuery = boundedText(query, "query");
    const safeCategory = boundedText(category, "category");
    if (!safeQuery) throw new Error("query is required");
    const result = await this.read("rpc/search_marketplace", undefined, {
      p_query: safeQuery, p_category: safeCategory, p_limit: boundedLimit(limit), p_offset: 0,
    }) as { apps: PublicApp[]; total: number };
    const apps = Array.isArray(result.apps) ? result.apps.slice(0, 10) : [];
    const ratings = await this.ratings(apps.map((app) => app.id));
    return { total: result.total, apps: apps.map((app) => publicApp(app, ratings.get(app.id))) };
  }

  async getApp(idOrSlug: string) {
    const key = boundedText(idOrSlug, "app_id_or_slug", 120);
    if (!key || !/^[a-zA-Z0-9-]+$/.test(key)) throw new Error("Invalid app ID or slug");
    const field = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? "id" : "slug";
    const params = new URLSearchParams({
      select: "id,slug,name,tagline,description,website_url,categories,platforms,launched_at",
      [field]: `eq.${key}`, limit: "1",
    });
    const [app] = await this.read("public_discoverable_apps", params) as PublicApp[];
    if (!app) throw new Error("Public app not found");
    const id = app.id;
    const [ratings, developer, traction, stripe, otherRevenue] = await Promise.all([
      this.ratings([id]),
      this.read("rpc/get_app_developer", undefined, { p_app_id: id }),
      this.read("public_app_traction", new URLSearchParams({ select: "provider,metric_type,visibility,value,value_range,metric_date,last_verified_at", app_id: `eq.${id}`, limit: "10" })),
      this.read("public_app_revenue", new URLSearchParams({ select: "provider,metric_type,visibility,currency,mrr_minor,range_lower_minor,range_upper_minor,revenue_scope,observed_at", app_id: `eq.${id}`, limit: "5" })),
      this.read("public_app_verified_revenue", new URLSearchParams({ select: "provider,metric_type,visibility,currency,value_minor,range_lower_minor,range_upper_minor,period_start,period_end,observed_at", app_id: `eq.${id}`, limit: "5" })),
    ]);
    const publicMetrics = (traction as Array<Record<string, unknown>>).filter((row) => ["exact", "range", "verified_only"].includes(String(row.visibility))).map((row) => ({
      provider: row.provider, metric_type: row.metric_type, visibility: row.visibility,
      metric_date: row.metric_date,
      ...(row.visibility === "exact" ? { value: row.value } : {}),
      ...(row.visibility === "range" ? { value_range: row.value_range } : {}),
    }));
    const revenueRows = [...stripe as Array<Record<string, unknown>>, ...otherRevenue as Array<Record<string, unknown>>];
    // The public profile hides revenue while a provider switch returns both projections.
    const revenue = stripe && otherRevenue && (stripe as unknown[]).length && (otherRevenue as unknown[]).length ? [] : revenueRows;
    const publicRevenue = revenue.filter((row) => ["exact", "range", "verified_only"].includes(String(row.visibility))).map((row) => ({
      provider: row.provider, metric_type: row.metric_type, visibility: row.visibility,
      currency: row.currency, revenue_scope: row.revenue_scope ?? "products", observed_at: row.observed_at,
      ...(row.visibility === "exact" ? { value_minor: row.mrr_minor ?? row.value_minor } : {}),
      ...(row.visibility === "range" ? { range_lower_minor: row.range_lower_minor, range_upper_minor: row.range_upper_minor } : {}),
    }));
    const identity = developer && typeof developer === "object" ? developer as { username?: string; full_name?: string } : null;
    return {
      ...publicApp(app, ratings.get(id)),
      description: (app.description || app.tagline || "").slice(0, 2000),
      platforms: app.platforms.slice(0, 10),
      launched_at: app.launched_at,
      developer: identity ? { display_name: identity.full_name || null, handle: identity.username ? `@${identity.username}` : null, profile_url: identity.username ? `${rocketUrl}/@${encodeURIComponent(identity.username)}` : null } : null,
      public_verified_metrics: [...publicMetrics, ...publicRevenue],
    };
  }

  async categories() {
    const rows = await this.read("public_app_categories", new URLSearchParams({ select: "category,app_count", order: "app_count.desc,category.asc", limit: "100", app_count: "gt.0" })) as Array<{ category: string; app_count: number }>;
    return rows.slice(0, 100).map((row) => ({ name: row.category, app_count: row.app_count, url: `${rocketUrl}/discover?view=all&category=${encodeURIComponent(row.category)}` }));
  }

  async trending(category = "", limit?: number) {
    const safeCategory = boundedText(category, "category");
    const safeLimit = boundedLimit(limit);
    const params = new URLSearchParams({ select: "app_id,rocket_view_count", rocket_view_count: "gt.0", order: "rocket_view_count.desc,last_viewed_at.desc.nullslast,launched_at.desc.nullslast,app_id.asc", limit: safeCategory ? "100" : String(safeLimit) });
    if (safeCategory) params.set("categories", `cs.{"${safeCategory.replace(/["\\]/g, "")}"}`);
    const ranked = await this.read("public_app_rankings", params) as Array<{ app_id: string; rocket_view_count: number }>;
    if (!ranked.length) return [];
    const selected = ranked.slice(0, safeLimit);
    const apps = await this.read("public_discoverable_apps", new URLSearchParams({ select: "id,slug,name,tagline,description,website_url,categories,platforms,launched_at", id: `in.(${selected.map((row) => row.app_id).join(",")})`, limit: String(safeLimit) })) as PublicApp[];
    const byId = new Map(apps.map((app) => [app.id, app]));
    const ratings = await this.ratings(apps.map((app) => app.id));
    return selected.flatMap(({ app_id, rocket_view_count }) => { const app = byId.get(app_id); return app ? [{ ...publicApp(app, ratings.get(app_id)), rocket_page_views: rocket_view_count }] : []; });
  }
}
