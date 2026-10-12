export type ShareKind = "app" | "profile" | "collection";
export type ShareVariant = "landscape" | "square" | "portrait";

const base = "https://tryrocket.ai";
const cardEndpoint = "https://lcujmvdgczkjxdstzhnr.supabase.co/functions/v1/rocket-share-card";

export function canonicalShareUrl(kind: ShareKind, identifier: string) {
  if (kind === "app") return `${base}/apps/${encodeURIComponent(identifier)}`;
  if (kind === "profile") return `${base}/@${encodeURIComponent(identifier)}`;
  return `${base}/collections/${encodeURIComponent(identifier)}`;
}

export function attributedShareUrl(kind: ShareKind, identifier: string, source = "share") {
  const url = new URL(canonicalShareUrl(kind, identifier));
  url.searchParams.set("utm_source", source === "share" ? "rocket_share" : `rocket_${source}`);
  return url.toString();
}

export function shareCardUrl(kind: ShareKind, identifier: string, variant: ShareVariant = "landscape", version?: string) {
  const url = new URL(cardEndpoint);
  url.searchParams.set("kind", kind);
  url.searchParams.set("id", identifier);
  url.searchParams.set("variant", variant);
  const contentVersion = version ? (/^[a-z0-9]{1,12}$/i.test(version) ? version : shareCardVersion(version)) : "base";
  url.searchParams.set("v", `b2${contentVersion}`);
  return url.toString();
}

export function shareCardVersion(...values: unknown[]) {
  let hash = 2166136261;
  for (const character of JSON.stringify(values)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function shareTargets(title: string, url: string, kind: ShareKind = "app") {
  const caption = kind === "app" ? `Just launched ${title} on Rocket.\n\n${url}` : kind === "profile" ? `Find ${title} on Rocket.\n\n${url}` : `Explore ${title} on Rocket.\n\n${url}`;
  return {
    caption,
    x: `https://twitter.com/intent/tweet?${new URLSearchParams({ text: caption })}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({ url })}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: url })}`,
    reddit: `https://www.reddit.com/submit?${new URLSearchParams({ url, title })}`,
    whatsapp: `https://api.whatsapp.com/send?${new URLSearchParams({ text: `${title} ${url}` })}`,
    telegram: `https://t.me/share/url?${new URLSearchParams({ url, text: title })}`,
  };
}
