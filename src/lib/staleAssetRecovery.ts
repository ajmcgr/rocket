const RELOAD_KEY = "rocket:stale-asset-reload";
const RELOAD_WINDOW_MS = 60_000;

export function isStaleAssetError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(message);
}

export function claimStaleAssetReload(storage: Storage, now = Date.now()): boolean {
  try {
    const previous = Number(storage.getItem(RELOAD_KEY));
    if (previous > 0 && now >= previous && now - previous < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    // Without a persistent guard, reloading could loop indefinitely.
    return false;
  }
}

export function recoverStaleAsset(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleAssetError(error)) return false;
  try {
    if (!claimStaleAssetReload(window.sessionStorage)) return false;
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
