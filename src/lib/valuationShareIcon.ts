/** Only a public hostname is sent to the icon service; URL paths and credentials stay private. */
export function valuationShareIconUrl(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || host.includes("..") || host.startsWith("-") || host.endsWith("-")) return null;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host) || /(?:^|\.)example\.com$/.test(host)) return null;
    return `https://icon.horse/icon/${encodeURIComponent(host)}/256?fallback=404`;
  } catch {
    return null;
  }
}
