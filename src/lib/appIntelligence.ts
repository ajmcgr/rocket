import type { Tables } from "@/integrations/supabase/types";

export type AppSignal = Tables<"public_app_intelligence">;

export function signalLabel(signal: AppSignal) {
  return signal.signal_type === "rising" ? "Rising on Launch" : "New & interesting on Launch";
}

export function signalExplanation(signal: AppSignal) {
  const top = Math.max(1, Math.ceil((1 - signal.percentile_rank) * 100 - 1e-9));
  const cohort = signal.cohort_category
    ? `${signal.cohort_category} products in the ${signal.age_band}-day launch-age band`
    : `Launch products in the ${signal.age_band}-day launch-age band`;
  return `${signal.net_votes} net Launch votes · top ${top}% of ${signal.cohort_size} ${cohort}.`;
}
