import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { earlyOutboundTrackingScript } from "./earlyOutboundTracking";

const appId = "00000000-0000-4000-8000-000000000001";

function install(search = "") {
  let click: ((event: Record<string, unknown>) => void) | undefined;
  class Element {
    closest() {
      return { getAttribute: () => appId };
    }
  }
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  runInNewContext(earlyOutboundTrackingScript, {
    location: { origin: "https://tryrocket.ai", search },
    document: { addEventListener: (_: string, handler: typeof click) => { click = handler; } },
    Element, URLSearchParams, JSON, fetch,
  });
  return { click: click!, target: new Element(), fetch };
}

describe("early outbound click tracking", () => {
  it("records a pre-hydration website click without blocking navigation", () => {
    const { click, target, fetch } = install("?utm_source=rocket_share");
    click({ target });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/functions/v1/rocket-app-view");
    expect(options.keepalive).toBe(true);
    expect(JSON.parse(options.body)).toEqual({ app_id: appId, kind: "outbound", source: "rocket_share", sponsorship_id: null });
  });
  it("does not double-record a click handled by React", () => {
    const { click, target, fetch } = install();
    click({ target, rocketOutboundHandled: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves sponsorship attribution for an early click", () => {
    const { click, target, fetch } = install("?sponsor=00000000-0000-4000-8000-000000000002");
    click({ target });
    expect(JSON.parse(fetch.mock.calls[0][1].body).sponsorship_id).toBe("00000000-0000-4000-8000-000000000002");
  });
});
