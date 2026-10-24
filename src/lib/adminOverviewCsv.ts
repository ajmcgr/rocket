const sections = [
  ["catalogue", "Catalogue"],
  ["users", "People"],
  ["discovery", "Discovery"],
  ["funnel", "Developer funnel"],
  ["attention", "Needs attention"],
  ["outreach", "Outreach"],
] as const;

function cell(value: string | number) {
  // Keep text inert when the CSV is opened in spreadsheet applications.
  const text = typeof value === "string" && /^\s*[=+\-@\t\r]/.test(value)
    ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function adminOverviewCsv(
  snapshot: Record<string, unknown>,
  period: string,
  loadedAt: string,
  exportedAt: string,
) {
  const rows: (string | number)[][] = [[
    "section", "metric", "value", "availability", "scope", "selected_period",
    "reporting_timezone", "snapshot_loaded_at_utc", "exported_at_utc",
  ]];
  for (const [key, section] of sections) {
    const stats = snapshot[key];
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) continue;
    for (const [metric, value] of Object.entries(stats)) {
      const tracked = typeof value === "number" && Number.isFinite(value);
      const outbound = key === "discovery" && metric === "outbound_clicks";
      const scope = outbound ? "Selected UTC calendar days (daily-deduplicated)" : key === "discovery" || key === "funnel" || (key === "users" && metric === "new_members")
        ? "Selected period"
        : key === "attention" && metric === "failed_imports" ? "Last 7 days" : "Current total";
      rows.push([
        section, metric, tracked ? value : "", tracked ? "tracked" : "not_tracked",
        scope, period, outbound ? "UTC" : "Asia/Bangkok", loadedAt, exportedAt,
      ]);
    }
  }
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadAdminOverviewCsv(snapshot: Record<string, unknown>, period: string, loadedAt: string) {
  const exportedAt = new Date().toISOString();
  const csv = adminOverviewCsv(snapshot, period, loadedAt, exportedAt);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `rocket-admin-overview-${period}-${exportedAt.replaceAll(/[:.]/g, "-")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
