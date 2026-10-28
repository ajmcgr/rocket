// Lightweight event tracking. Ships to whichever provider is present on
// window (PostHog, Plausible, GA/gtag) — otherwise buffers to console + a
// bounded in-memory queue for debugging via `window.__rocketEvents`.
// Zero cost when no provider is loaded.

export type AnalyticsEvent =
  | "verification_entry_viewed"
  | "verification_connection_started"
  | "verification_connection_authorized"
  | "verification_sync_completed"
  | "verification_visibility_changed"
  | "verification_profile_preview_clicked"
  | "verification_share_clicked"
  | "onboarding_started"
  | "onboarding_intent_selected"
  | "onboarding_step_viewed"
  | "onboarding_skipped"
  | "onboarding_completed"
  | "onboarding_primary_cta_clicked"
  | "analytics_connected"
  | "analytics_sync_succeeded"
  | "revenue_connected"
  | "revenue_sync_succeeded"
  | "plan_picker_viewed"
  | "plan_selected"
  | "billing_interval_changed"
  | "asset_generated"
  | "asset_exported"
  | "asset_shared"
  | "asset_regenerated"
  | "project_created"
  | "project_kit_completed"
  | "field_regenerated"
  | "slide_regenerated"
  | "checkout_started"
  | "checkout_completed"
  | "credit_topup_eligible"
  | "credit_topup_surface"
  | "credit_topup_interacted"
  | "pricing_viewed"
  | "signup_started"
  | "signup_completed"
  | "gallery_liked"
  | "gallery_remixed"
  | "tour_started"
  | "tour_completed"
  | "organic_template_view"
  | "organic_template_cta"
  | "discovery_search"
  | "discovery_view_selected"
  | "discovery_category_selected"
  | "app_profile_viewed"
  | "outbound_app_clicked"
  | "app_saved"
  | "app_unsaved"
  | "launch_started"
  | "launch_url_submitted"
  | "launch_existing_app_resolved"
  | "launch_new_app_created"
  | "app_claim_started"
  | "claim_started"
  | "claim_verified"
  | "app_claim_completed"
  | "app_verification_started"
  | "app_verification_completed"
  | "advertise_page_viewed"
  | "featured_app_selected"
  | "category_sponsor_selected"
  | "sponsorship_checkout_started"
  | "sponsored_impression"
  | "sponsored_click"
  | "empty_sponsorship_cta_clicked"
  | "share_button_clicked"
  | "share_destination_clicked"
  | "share_link_copied"
  | "share_caption_copied"
  | "share_card_downloaded"
  | "share_native_completed"
  | "rocket100_page_viewed"
  | "rocket100_cta_clicked"
  | "rocket100_qualified"
  | "rocket100_awarded"
  | "rocket100_shared"
  | "rocket100_profile_clicked"
  | "rocket_recap_viewed"
  | "rocket_recap_share_created"
  | "rocket_recap_share_revoked"
  | "rocket_recap_public_visited"
  | "rocket_recap_profile_clicked"
  | "rocket_recap_app_clicked";

const QUEUE_KEY = "__rocketEvents";
const MAX_QUEUE = 200;

export function track(event: AnalyticsEvent, props: Record<string, any> = {}) {
  try {
    const w = window as any;
    if (typeof w.posthog?.capture === "function")
      w.posthog.capture(event, props);
    if (typeof w.plausible === "function") w.plausible(event, { props });
    // Google Analytics' bootstrap can leave a dataLayer available before it
    // exposes window.gtag. Queue the event in the same shape as gtag so the
    // tag manager receives it once it finishes loading.
    if (typeof w.gtag === "function") {
      w.gtag("event", event, props);
    } else if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push(["event", event, props]);
    }
    const q: any[] = (w[QUEUE_KEY] ||= []);
    q.push({ event, props, at: new Date().toISOString() });
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    if (import.meta.env?.DEV) console.debug("[track]", event, props);
  } catch {
    // Never let telemetry break the app.
  }
}
