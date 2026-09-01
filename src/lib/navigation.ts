export const DEFAULT_AUTH_RETURN_PATH = "/logos";

export function safeReturnPath(value: string | null | undefined, fallback = DEFAULT_AUTH_RETURN_PATH) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
