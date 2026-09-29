export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GA4_METRICS = ["activeUsers", "sessions", "screenPageViews"] as const;
export const METRIC_TYPES = ["active_users", "sessions", "views"] as const;
export const VISIBILITIES = ["private", "verified_only", "range", "exact"] as const;

export function hostnameFromStream(defaultUri: string): string | null {
  try {
    const url = new URL(defaultUri);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

export function matchingStreamHost(canonicalHost: string, defaultUri: string): boolean {
  return hostnameFromStream(defaultUri) === canonicalHost.toLowerCase().replace(/^www\./, "");
}

export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const last = new Date(`${end}T00:00:00Z`).getTime();
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= last; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export function completeDateWindow(timeZone: string, days: number): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const day = new Date(`${today}T00:00:00Z`).getTime();
  return {
    start: new Date(day - days * 86_400_000).toISOString().slice(0, 10),
    end: new Date(day - 86_400_000).toISOString().slice(0, 10),
  };
}

export type GA4Row = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
export function dailyMetricPoints(rows: GA4Row[], start: string, end: string) {
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    const rawDate = row.dimensionValues?.[0]?.value || "";
    if (!/^\d{8}$/.test(rawDate)) throw new Error("Invalid GA4 report date");
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}`;
    if (date < start || date > end || byDate.has(date)) throw new Error("Unexpected GA4 report date");
    const values = [0, 1, 2].map((index) => {
      const raw = row.metricValues?.[index]?.value;
      if (!raw || !/^\d+$/.test(raw)) throw new Error("Invalid GA4 metric value");
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) throw new Error("GA4 metric exceeds safe integer range");
      return value;
    });
    byDate.set(date, values);
  }
  return datesBetween(start, end).flatMap((date) =>
    METRIC_TYPES.map((metric_type, index) => ({ metric_date: date, metric_type, metric_value: byDate.get(date)?.[index] ?? 0 })));
}

// Growth is defined only for complete, contiguous days. Active users are excluded:
// summing daily unique users would not produce a weekly/monthly unique count.
export function completePeriodGrowth(points: Array<{ metric_date: string; metric_value: number }>, end: string, days: 7 | 30): number | null {
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const start = new Date(endMs - (2 * days - 1) * 86_400_000).toISOString().slice(0, 10);
  const expected = datesBetween(start, end);
  const values = new Map(points.map((point) => [point.metric_date, point.metric_value]));
  if (expected.some((date) => !values.has(date))) return null;
  const previous = expected.slice(0, days).reduce((sum, date) => sum + values.get(date)!, 0);
  if (previous === 0) return null;
  const current = expected.slice(days).reduce((sum, date) => sum + values.get(date)!, 0);
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
