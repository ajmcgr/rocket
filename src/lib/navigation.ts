export const DEFAULT_AUTH_RETURN_PATH = "/discover";

export function safeReturnPath(value: string | null | undefined, fallback = DEFAULT_AUTH_RETURN_PATH) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const origin = typeof window === "undefined" ? "https://tryrocket.ai" : window.location.origin;
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
