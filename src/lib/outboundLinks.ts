type Attribution = {
  campaign?: "app_listing" | "featured_app" | "category_sponsor";
  content?: "homepage" | "footer" | "category";
};

/** Add attribution to website visits without overwriting the merchant's tracking. */
export function outboundWebsiteUrl(value: string, { campaign = "app_listing", content }: Attribution = {}): string {
  let url: URL;
  try { url = new URL(value); } catch { return value; }
  if (!["https:", "http:"].includes(url.protocol)) return value;
  const tags: Record<string, string> = {
    utm_source: "rocket",
    utm_medium: campaign === "app_listing" ? "referral" : "display",
    utm_campaign: campaign,
    ...(content ? { utm_content: content } : {}),
  };
  const additions = new URLSearchParams();
  for (const [key, tag] of Object.entries(tags)) {
    if (!url.searchParams.has(key)) additions.set(key, tag);
  }
  const query = additions.toString();
  if (!query) return value;
  // Keep the original query encoding, path and fragment.
  const hashAt = value.indexOf("#");
  const base = hashAt < 0 ? value : value.slice(0, hashAt);
  const hash = hashAt < 0 ? "" : value.slice(hashAt);
  const separator = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";
  return `${base}${separator}${query}${hash}`;
}
