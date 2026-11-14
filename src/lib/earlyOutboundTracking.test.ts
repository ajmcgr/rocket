import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { earlyOutboundTrackingScript } from "./earlyOutboundTracking";

const appId = "00000000-0000-4000-8000-000000000001";

function install(search = "") {
  let click: ((event: Record<string, unknown>) => void) | undefined;
  const microtasks: Array<() => void> = [];
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
    queueMicrotask: (task: () => void) => microtasks.push(task),
  });
  return { click: click!, target: new Element(), fetch, flush: () => microtasks.splice(0).forEach(task => task()) };
}

describe("early outbound click tracking", () => {
  it("records a pre-hydration website click without blocking navigation", () => {
    const { click, target, fetch, flush } = install("?utm_source=rocket_share");
    click({ target });
    flush();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/functions/v1/rocket-app-view");
    expect(options.keepalive).toBe(true);
    expect(JSON.parse(options.body)).toEqual({ app_id: appId, kind: "outbound", source: "rocket_share", sponsorship_id: null });
  });
  it("does not double-record a click handled by React", () => {
    const { click, target, fetch, flush } = install();
    click({ target, rocketOutboundHandled: true });
    flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not send when React handles the click later in the same event", () => {
    const { click, target, fetch, flush } = install();
    const event = { target, rocketOutboundHandled: false };
    click(event);
    event.rocketOutboundHandled = true;
    flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves sponsorship attribution for an early click", () => {
    const { click, target, fetch, flush } = install("?sponsor=00000000-0000-4000-8000-000000000002");
    click({ target });
    flush();
    expect(JSON.parse(fetch.mock.calls[0][1].body).sponsorship_id).toBe("00000000-0000-4000-8000-000000000002");
  });
});
