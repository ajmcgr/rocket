import type { Tables } from "@/integrations/supabase/types";

export type AppTrust = Tables<"public_app_trust">;

// Only server-projected evidence can become a trust label. Launch rankings are
// intentionally absent: Rising is an observation, never a recommendation.
export function trustLabels(trust?: AppTrust | null): string[] {
  if (!trust) return [];
  const labels: string[] = [];
  if (trust.claimed) labels.push("Claimed");
  if (trust.domain_verified) labels.push("Domain verified");
  if (trust.traffic_verified) labels.push("Traffic verified");
  if (trust.revenue_verified) labels.push("Revenue verified");
  return labels;
}
