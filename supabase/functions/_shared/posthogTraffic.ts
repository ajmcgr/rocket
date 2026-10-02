import { datesBetween, METRIC_TYPES } from "./ga4Traffic.ts";

export const POSTHOG_SCOPES = [
  "project:read",
  "endpoint:read",
  "endpoint:write",
] as const;
export function posthogOrigin(region: unknown): string {
  if (region !== "us" && region !== "eu")
    throw new Error("Invalid PostHog region");
  return `https://${region}.posthog.com`;
}
export function trafficQuery(host: string): string {
  const canonical = host.toLowerCase().replace(/^www\./, "");
  if (
    !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(canonical) ||
    !canonical.includes(".")
  )
    throw new Error("Invalid app domain");
  return `SELECT toString(toDate(timestamp, 'UTC')) AS metric_date,
uniqExact(distinct_id) AS active_users,
uniqExactIf(properties.$session_id, properties.$session_id IS NOT NULL AND properties.$session_id != '') AS sessions,
count() AS views
FROM events
WHERE event = '$pageview'
AND timestamp >= toStartOfDay(now(), 'UTC') - INTERVAL 90 DAY
AND timestamp < toStartOfDay(now(), 'UTC')
AND lower(coalesce(properties.$host, domain(properties.$current_url))) IN ('${canonical}', 'www.${canonical}')
GROUP BY metric_date ORDER BY metric_date LIMIT 90`;
}
export function posthogPoints(
  report: { results?: unknown; columns?: unknown; hasMore?: boolean },
  start: string,
  end: string,
) {
  const expected = ["metric_date", ...METRIC_TYPES];
  if (
    report.hasMore ||
    !Array.isArray(report.results) ||
    !Array.isArray(report.columns) ||
    JSON.stringify(report.columns) !== JSON.stringify(expected) ||
    report.results.length > 90
  )
    throw new Error("PostHog returned an incomplete traffic report");
  const dates = datesBetween(start, end);
  const byDate = new Map<string, number[]>();
  for (const raw of report.results) {
    if (
      !Array.isArray(raw) ||
      raw.length !== 4 ||
      typeof raw[0] !== "string" ||
      !dates.includes(raw[0]) ||
      byDate.has(raw[0])
    )
      throw new Error("PostHog returned an invalid report date");
    const values = raw.slice(1).map((value) => {
      if (
        (typeof value !== "number" &&
          (typeof value !== "string" || !/^\d+$/.test(value))) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < 0
      )
        throw new Error("PostHog returned an invalid traffic total");
      return Number(value);
    });
    byDate.set(raw[0], values);
  }
  return dates.flatMap((date) =>
    METRIC_TYPES.map((metric_type, i) => ({
      metric_date: date,
      metric_type,
      metric_value: byDate.get(date)?.[i] ?? 0,
    })),
  );
}
