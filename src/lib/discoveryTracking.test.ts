import { afterEach, describe, expect, it, vi } from "vitest";
import { recordDiscoverySearch } from "./discoveryTracking";
const { invoke, track } = vi.hoisted(() => ({ invoke: vi.fn(), track: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/lib/analytics", () => ({ track }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("Persistent discovery submissions", () => {
  it("records each submission once with an opaque event ID and no query text", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { location: { origin: "https://tryrocket.ai", search: "" }, innerWidth: 1200,
      sessionStorage: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) } });
    vi.stubGlobal("navigator", { doNotTrack: "0" });
    invoke.mockResolvedValue({ data: true, error: null });
    for (const source of ["header", "homepage", "discover"] as const) await recordDiscoverySearch("private text", source);
    expect(invoke).toHaveBeenCalledTimes(6);
    const searchCalls = invoke.mock.calls.filter(([, args]) => args.body.kind === "search");
    const ids = searchCalls.map(([, args]) => args.body.event_id);
    expect(new Set(ids).size).toBe(3);
    expect(searchCalls[0]).toEqual(["rocket-app-view", {body: {kind: "search", source: "header", event_id: expect.any(String)}}]);
    expect(invoke.mock.calls.filter(([, args]) => args.body.kind === "journey")).toHaveLength(3);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("private text");
  });
  it("does not persist empty/punctuation-only searches or preview traffic", async () => {
    vi.stubGlobal("window", { location: { origin: "https://tryrocket.ai" } });
    await recordDiscoverySearch("   ", "header");
    await recordDiscoverySearch("!?", "discover");
    vi.stubGlobal("window", { location: { origin: "http://localhost:8080" } });
    await recordDiscoverySearch("tools", "homepage");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("keeps search usable when the tracking request fails", async () => {
    vi.stubGlobal("window", { location: { origin: "https://tryrocket.ai" } });
    invoke.mockRejectedValueOnce(new Error("offline"));
    await expect(recordDiscoverySearch("tools", "header")).resolves.toBeUndefined();
  });
});
