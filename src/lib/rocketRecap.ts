export type RecapApp = { id: string; slug: string; name: string; logo_url: string | null; views: number; clicks: number };
export type Recap = { month: string; apps: RecapApp[]; totals: { views: number; clicks: number; app_count: number }; coverage: { views: string; clicks: string }; updated_at: string };
export type RecapShare = { id: string; month: string; app_id: string | null; snapshot: { metrics: Record<string, number>; app: RecapApp | null } };

export function completedUtcMonth(today = new Date()): string {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

export function priorMonth(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 2, 1)).toISOString().slice(0, 10);
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
}

export function monthlyChange(current: Recap, previous: Recap | undefined, metric: "views" | "clicks"): string | null {
  if (!previous || current.coverage[metric] !== "complete" || previous.coverage[metric] !== "complete") return null;
  const before = Number(previous.totals[metric]);
  if (!Number.isFinite(before) || before <= 0) return null;
  const after = Number(current.totals[metric]);
  return `${Math.round(((after - before) / before) * 100) >= 0 ? "+" : ""}${Math.round(((after - before) / before) * 100)}% vs. last month`;
}

export function meaningfulHighlight(apps: RecapApp[]): RecapApp | null {
  const winner = [...apps].sort((a, b) => b.views - a.views || a.name.localeCompare(b.name))[0];
  return winner && winner.views >= 10 ? winner : null;
}
