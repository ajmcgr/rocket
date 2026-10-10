// RevenueCat Charts v3 project revenue, not subscription MRR. Its revenue
// definition includes purchases and ads and deducts refunds/adjustments in
// the period they are processed. We only accept a single-app project because
// the project metric endpoint cannot be scoped to selected products.
export const REVENUECAT_CALCULATION_VERSION = 1;
export const REVENUECAT_SCOPES = [
  "project_configuration:projects:read",
  "project_configuration:apps:read",
  "project_configuration:products:read",
  "charts_metrics:overview:read",
].join(" ");

export type RevenueCatObject = Record<string, unknown>;
export type RevenueCatSource = {
  projectId: string;
  appId: string;
  productIds: string[];
};

export function isRevenueCatId(value: unknown, prefix: "proj" | "app" | "prod"): value is string {
  return typeof value === "string" && new RegExp(`^${prefix}[A-Za-z0-9_]{3,100}$`).test(value);
}

export function validateSingleAppProject(
  projectId: string, appId: string, apps: RevenueCatObject[], products: RevenueCatObject[],
): RevenueCatSource {
  if (!isRevenueCatId(projectId, "proj") || !isRevenueCatId(appId, "app"))
    throw new Error("Invalid RevenueCat source");
  if (apps.length !== 1 || apps[0]?.id !== appId || apps[0]?.project_id !== projectId)
    throw new Error("This RevenueCat project must contain exactly one app");
  if (!products.length || products.length > 1000)
    throw new Error("This RevenueCat project has no supported product catalogue");
  const productIds = products.map((product) => {
    if (!isRevenueCatId(product.id, "prod") || product.app_id !== appId)
      throw new Error("RevenueCat product does not belong to this app");
    return product.id;
  });
  if (new Set(productIds).size !== productIds.length)
    throw new Error("RevenueCat product catalogue contains duplicates");
  return { projectId, appId, productIds: productIds.sort() };
}

export function revenuePeriod(now = new Date()): { start: string; end: string } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today.getTime() - 86_400_000);
  const start = new Date(today.getTime() - 30 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function validateRevenueCatMetric(
  response: RevenueCatObject, start: string, end: string,
): { valueMinor: number; currency: "USD"; periodStart: string; periodEnd: string } {
  if (response.object !== "revenue_metric" || response.revenue_type !== "revenue"
    || response.currency !== "USD" || response.start_date !== start || response.end_date !== end
    || typeof response.value !== "number" || !Number.isFinite(response.value)
    || Math.abs(response.value) > 1_000_000_000_000)
    throw new Error("RevenueCat returned an unsupported revenue metric");
  const valueMinor = Math.round(response.value * 100);
  if (!Number.isSafeInteger(valueMinor))
    throw new Error("RevenueCat returned an unsupported revenue amount");
  return { valueMinor, currency: "USD", periodStart: start, periodEnd: end };
}

export function revenueCatAuthorizationUrl(
  clientId: string, callbackUrl: string, state: string, challenge: string,
): string {
  const url = new URL("https://api.revenuecat.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", REVENUECAT_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}
