import { useEffect, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
const supabase = _sb as any;

export type CreditCost = { asset_type: string; label: string; credits: number; category: "text" | "image" };

let cached: CreditCost[] | null = null;
let pending: Promise<CreditCost[]> | null = null;

export function fetchCreditCosts(): Promise<CreditCost[]> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  const next: Promise<CreditCost[]> = supabase
    .from("credit_costs")
    .select("asset_type, label, credits, category")
    .then(({ data }: any) => {
      cached = (data || []) as CreditCost[];
      pending = null;
      return cached as CreditCost[];
    });
  pending = next;
  return next;
}

export function useCreditCosts() {
  const [costs, setCosts] = useState<CreditCost[]>(cached || []);
  useEffect(() => {
    let alive = true;
    fetchCreditCosts().then((rows) => alive && setCosts(rows));
    return () => { alive = false; };
  }, []);
  const map = new Map(costs.map((c) => [c.asset_type, c]));
  const costFor = (asset_type: string, fallback = 1): number => map.get(asset_type)?.credits ?? fallback;
  return { costs, map, costFor };
}

// Mirrors backend workflow specs so the form can preview cost without an extra RPC.
export const WORKFLOW_ASSETS: Record<string, { text: string[]; image: string[] }> = {
  brand: {
    text: [
      "positioning_tagline","positioning_value_prop","positioning_elevator","positioning_audience",
      "positioning_category","positioning_differentiator",
      "audience_ideal_customer","audience_pain_points","audience_use_cases","audience_messaging",
      "founder_bio","founder_tagline","founder_x_bio","founder_linkedin",
    ],
    image: [],
  },
  design: {
    text: ["design_style_direction","design_color_palette","design_typography"],
    image: ["design_image_1","design_image_2","design_image_3"],
  },
  launch: {
    text: [
      "launch_submission","launch_product_hunt","launch_directory","founder_story",
      "strategy_readiness","strategy_channels","strategy_communities","strategy_content",
      "checklist_pre","checklist_day","checklist_post",
    ],
    image: [],
  },
  promote: {
    text: [
      "social_x_post","social_x_thread","social_linkedin","social_reddit","social_newsletter",
      "promote_influencer_outreach","promote_pr_pitch","promote_creator_campaign",
    ],
    image: [],
  },
};

export function workflowCost(workflow: string, costFor: (t: string, f?: number) => number): number {
  const spec = WORKFLOW_ASSETS[workflow];
  if (!spec) return 0;
  const text = spec.text.reduce((s, t) => s + costFor(t, 1), 0);
  const image = spec.image.reduce((s, t) => s + costFor(t, 25), 0);
  return text + image;
}
