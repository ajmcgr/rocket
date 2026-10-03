// Short-lived, bounded browser memory cache for curated PUBLIC catalogue data
// only. Never use for sessions, saves, ownership, trust, entitlements or payments.
type Scope = "categories" | "preview" | "catalogue" | "media";
type Entry = { expires: number; promise: Promise<unknown> };
const entries = new Map<string, Entry>();
const TTL = 60_000;
const LIMIT = 48;

export function publicMarketplaceRead<T>(scope: Scope, key: string, load: () => PromiseLike<T>): Promise<T> {
  // Do not share request data across SSR visitors.
  if (typeof window === "undefined") return Promise.resolve(load());
  const cacheKey = `${scope}:${key}`;
  const existing = entries.get(cacheKey);
  if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
  entries.delete(cacheKey);
  const entry: Entry = { expires: Date.now() + TTL, promise: Promise.resolve().then(load) };
  entries.set(cacheKey, entry);
  while (entries.size > LIMIT) entries.delete(entries.keys().next().value!);
  void entry.promise.then((result) => {
    if (result && typeof result === "object" && "error" in result && result.error && entries.get(cacheKey) === entry) entries.delete(cacheKey);
  }, () => { if (entries.get(cacheKey) === entry) entries.delete(cacheKey); });
  return entry.promise as Promise<T>;
}

export function clearPublicMarketplaceCache() { entries.clear(); }
