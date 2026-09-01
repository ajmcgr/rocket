export type PaidPlan = "starter" | "growth" | "business";

export const MONTHLY_LIMITS: Record<PaidPlan | "free", number> = {
  free: 100,
  starter: 500,
  growth: 3000,
  business: 15000,
};

export function paidPlanFromProduct(product?: string | null): PaidPlan | null {
  const base = product?.replace(/_yearly$/, "");
  if (base === "pro" || base === "growth") return "growth";
  if (base === "starter" || base === "business") return base;
  return null;
}

export function paidPlanFromSubscription(sub: {
  metadata?: Record<string, string> | null;
  items: { data: Array<{ price?: { unit_amount?: number | null } | null }> };
}): PaidPlan | null {
  const fromMetadata = paidPlanFromProduct(sub.metadata?.product);
  if (fromMetadata) return fromMetadata;

  const amount = sub.items.data[0]?.price?.unit_amount;
  if (amount === 1200 || amount === 9900) return "starter";
  if (amount === 2000 || amount === 16600) return "growth";
  if (amount === 5000 || amount === 41500) return "business";
  return null;
}

export function planName(plan: PaidPlan): string {
  return plan === "growth" ? "Pro" : plan[0].toUpperCase() + plan.slice(1);
}
