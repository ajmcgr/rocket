// Lightweight event tracking. Ships to whichever provider is present on
// window (PostHog, Plausible, GA/gtag) — otherwise buffers to console + a
// bounded in-memory queue for debugging via `window.__rocketEvents`.
// Zero cost when no provider is loaded.

export type AnalyticsEvent =
  | "asset_generated"
  | "asset_exported"
  | "asset_shared"
  | "asset_regenerated"
  | "project_created"
  | "project_kit_completed"
  | "field_regenerated"
  | "slide_regenerated"
  | "checkout_started"
  | "pricing_viewed"
  | "signup_started"
  | "signup_completed"
  | "gallery_liked"
  | "gallery_remixed"
  | "tour_started"
  | "tour_completed";

const QUEUE_KEY = "__rocketEvents";
const MAX_QUEUE = 200;

export function track(event: AnalyticsEvent, props: Record<string, any> = {}) {
  try {
    const w = window as any;
    if (typeof w.posthog?.capture === "function") w.posthog.capture(event, props);
    if (typeof w.plausible === "function") w.plausible(event, { props });
    // Google Analytics' bootstrap can leave a dataLayer available before it
    // exposes window.gtag. Queue the event in the same shape as gtag so the
    // tag manager receives it once it finishes loading.
    if (typeof w.gtag === "function") {
      w.gtag("event", event, props);
    } else if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push((function () { return arguments; })("event", event, props));
    }
    const q: any[] = (w[QUEUE_KEY] ||= []);
    q.push({ event, props, at: new Date().toISOString() });
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    if (import.meta.env?.DEV) console.debug("[track]", event, props);
  } catch {
    // Never let telemetry break the app.
  }
}
