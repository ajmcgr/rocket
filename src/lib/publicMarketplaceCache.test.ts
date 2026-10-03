// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clearPublicMarketplaceCache, publicMarketplaceRead } from "./publicMarketplaceCache";

beforeEach(() => { clearPublicMarketplaceCache(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());
describe("bounded public marketplace reads", () => {
  it("deduplicates simultaneous reads and fresh back navigation", async () => {
    const load = vi.fn(async () => ({ data: ["public app"], error: null }));
    const [a, b] = await Promise.all([publicMarketplaceRead("catalogue", "page0", load), publicMarketplaceRead("catalogue", "page0", load)]);
    expect(a).toBe(b);
    await publicMarketplaceRead("catalogue", "page0", load);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps filters separate and expires after one minute", async () => {
    const load = vi.fn(async () => ({ data: [], error: null }));
    await publicMarketplaceRead("catalogue", "page0", load);
    await publicMarketplaceRead("catalogue", "page1", load);
    vi.advanceTimersByTime(60_001);
    await publicMarketplaceRead("catalogue", "page0", load);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("does not retain failed responses", async () => {
    const load = vi.fn(async () => ({ error: "unavailable" }));
    await publicMarketplaceRead("catalogue", "page0", load);
    await publicMarketplaceRead("catalogue", "page0", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("evicts old entries rather than growing with thousands of apps", async () => {
    const load = vi.fn(async () => ({ data: [], error: null }));
    for (let i = 0; i < 49; i++) await publicMarketplaceRead("catalogue", String(i), load);
    await publicMarketplaceRead("catalogue", "0", load);
    expect(load).toHaveBeenCalledTimes(50);
  });
});
