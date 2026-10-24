import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

/** Count explicit non-empty searches, never keystrokes, page loads or filters. */
export async function recordDiscoverySearch(query: string, source: "header" | "homepage" | "discover") {
  const hasQuery = /[\p{L}\p{N}]/u.test(query);
  track("discovery_search", { source, has_query: hasQuery });
  if (!hasQuery || typeof window === "undefined" ||
    !["https://tryrocket.ai", "https://www.tryrocket.ai"].includes(window.location.origin)) return;
  try {
    // No query text, account ID or persistent visitor ID leaves the browser.
    await supabase.functions.invoke("rocket-app-view", {
      body: { kind: "search", event_id: crypto.randomUUID(), source },
    });
  } catch {
    // Telemetry must never block search/navigation.
  }
}
