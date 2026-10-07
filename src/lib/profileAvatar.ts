import { safeProfileUrl } from "./memberProfile";

// Resolve display variants only; never overwrite the user's saved upload/source.
export function profileAvatarUrl(value: string) {
  const safe = safeProfileUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  if (url.protocol !== "https:") return safe;
  if (
    url.hostname === "pbs.twimg.com" &&
    url.pathname.startsWith("/profile_images/")
  ) {
    url.pathname = url.pathname.replace(
      /_(normal|mini|bigger)(\.(?:jpg|jpeg|png|webp))$/i,
      "_400x400$2",
    );
  } else if (/^lh\d*\.googleusercontent\.com$/.test(url.hostname)) {
    url.pathname = url.pathname.replace(/=s\d+(-[a-z0-9-]+)?$/i, "=s384$1");
    if (url.searchParams.has("sz")) url.searchParams.set("sz", "384");
  }
  return url.href;
}
