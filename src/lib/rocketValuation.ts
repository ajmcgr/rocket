/** Rocket's illustrative software valuation model. Monetary amounts use major currency units. */
export const VALUATION_MODEL_VERSION = "1.0.0";
export const BUSINESS_MODELS = ["saas", "ai", "mobile", "subscription", "one_time", "marketplace", "other"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];
export type ValuationCurrency = "USD" | "EUR" | "GBP";
export type ValuationInputs = {
  appName?: string; appUrl?: string; currency: ValuationCurrency;
  mrr: number; monthlyTraffic: number; monthlyRevenueGrowthPct: number; ageMonths: number; businessModel: BusinessModel;
  monthlyProfit?: number; grossMarginPct?: number; monthlyChurnPct?: number; revenueConcentrationPct?: number;
  organicTrafficPct?: number; annualRecurringRevenue?: number; payingCustomers?: number;
  monthlyOperatingExpenses?: number; trafficGrowthPct?: number;
  platformDependence?: "low" | "medium" | "high"; operationalComplexity?: "low" | "medium" | "high";
};
export type ValuationEvidence = { stripe: boolean; ga4: boolean };
export type ValuationResult = {
  modelVersion: typeof VALUATION_MODEL_VERSION; currency: ValuationCurrency;
  low: number | null; central: number | null; high: number | null;
  basis: "annual_profit" | "annual_recurring_revenue" | "insufficient_evidence";
  basisAmount: number | null; impliedMultiple: number | null; confidence: "low" | "medium" | "high";
  drivers: string[]; risks: string[]; suggestions: string[]; assumptions: string[]; methodology: string;
  evidence: ValuationEvidence;
};
const limits: Array<[keyof ValuationInputs, number, number]> = [
  ["mrr", 0, 10_000_000], ["monthlyTraffic", 0, 1_000_000_000], ["monthlyRevenueGrowthPct", -100, 500], ["ageMonths", 0, 600],
  ["monthlyProfit", -10_000_000, 10_000_000], ["grossMarginPct", 0, 100], ["monthlyChurnPct", 0, 100],
  ["revenueConcentrationPct", 0, 100], ["organicTrafficPct", 0, 100], ["annualRecurringRevenue", 0, 120_000_000],
  ["payingCustomers", 0, 100_000_000], ["monthlyOperatingExpenses", 0, 10_000_000], ["trafficGrowthPct", -100, 500],
];
export function validateValuationInputs(input: ValuationInputs): string[] {
  const errors: string[] = [];
  if (!["USD", "EUR", "GBP"].includes(input.currency)) errors.push("Choose a supported currency.");
  if (!BUSINESS_MODELS.includes(input.businessModel)) errors.push("Choose a business model.");
  if (input.appName && input.appName.length > 120) errors.push("App name is too long.");
  if (input.appUrl && (input.appUrl.length > 500 || !/^https?:\/\/[^\s.]+(?:\.[^\s]+)+/i.test(input.appUrl))) errors.push("Enter a valid app URL beginning with https:// or leave it blank.");
  for (const [key, min, max] of limits) {
    const value = input[key];
    if (value === undefined) {
      if (["mrr", "monthlyTraffic", "monthlyRevenueGrowthPct", "ageMonths"].includes(key)) errors.push(`${key} is required.`);
    } else if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) errors.push(`${key} must be between ${min} and ${max}.`);
  }
  for (const key of ["platformDependence", "operationalComplexity"] as const) {
    if (input[key] && !["low", "medium", "high"].includes(input[key]!)) errors.push(`Choose a valid ${key} level.`);
  }
  return errors;
}
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => n < 1000 ? Math.round(n) : Math.round(n / 100) * 100;
const recurring = (model: BusinessModel) => ["saas", "ai", "mobile", "subscription"].includes(model);

export function calculateValuation(input: ValuationInputs, evidence: ValuationEvidence = { stripe: false, ga4: false }): ValuationResult {
  const errors = validateValuationInputs(input);
  if (errors.length) throw new Error(errors.join(" "));
  const drivers: string[] = [], risks: string[] = [], suggestions: string[] = [], assumptions: string[] = [];
  const verified = { stripe: evidence.stripe === true, ga4: evidence.ga4 === true };
  const mrrArr = input.mrr * 12;
  const arr = mrrArr > 0 ? mrrArr : input.annualRecurringRevenue || 0;
  if (mrrArr > 0 && input.annualRecurringRevenue && Math.abs(input.annualRecurringRevenue - mrrArr) / mrrArr > 0.1)
    risks.push("Entered ARR and MRR disagree by more than 10%; MRR is used once, not added to ARR.");
  if (!input.annualRecurringRevenue && input.mrr > 0) assumptions.push("ARR is annualized from current MRR (MRR × 12), not forecast.");
  if (input.monthlyProfit === undefined && input.monthlyOperatingExpenses !== undefined) assumptions.push("Expenses are context; profit is not inferred from recurring revenue alone.");
  if (input.monthlyProfit === undefined) risks.push("Profit has not been supplied; buyer diligence may change the estimate.");
  if (!verified.stripe && arr > 0) risks.push("Revenue is self-reported, not verified through Stripe.");
  if (!verified.ga4 && input.monthlyTraffic > 0) risks.push("Traffic is self-reported, not verified through Google Analytics.");
  if (input.ageMonths < 12) risks.push("Less than 12 months of operating history limits confidence.");
  if (input.monthlyChurnPct !== undefined && input.monthlyChurnPct >= 7) { risks.push("Elevated churn may reduce recurring revenue durability."); suggestions.push("Improve retention and document churn by cohort."); }
  if (input.revenueConcentrationPct !== undefined && input.revenueConcentrationPct >= 40) { risks.push("A large share of revenue depends on one customer."); suggestions.push("Diversify the customer base."); }
  if (input.platformDependence === "high") { risks.push("Heavy dependence on a third-party platform increases transfer risk."); suggestions.push("Document platform dependencies and migration plans."); }
  if (input.operationalComplexity === "high") { risks.push("High operating complexity can make transfer harder."); suggestions.push("Document operations and reduce founder-specific work."); }
  if (input.monthlyRevenueGrowthPct >= 5) drivers.push("Positive recent revenue growth supports buyer interest.");
  if (input.monthlyRevenueGrowthPct < 0) risks.push("Revenue is declining month over month.");
  if (input.monthlyProfit !== undefined && input.monthlyProfit > 0) drivers.push("Positive owner-reported monthly profit supports a profit-based method.");
  if (input.organicTrafficPct !== undefined && input.organicTrafficPct >= 60 && input.monthlyTraffic > 0) drivers.push("A substantial organic traffic share may reduce acquisition dependence.");
  if (input.monthlyTraffic > 0) assumptions.push("Traffic is acquisition context; visitor volume creates no dollar value by itself.");
  if (!input.monthlyProfit || input.monthlyProfit <= 0) suggestions.push("Show sustainable profit or reliable subscription revenue to support buyer pricing.");
  if (input.organicTrafficPct === undefined) suggestions.push("Document where traffic and customers come from.");
  if (input.ageMonths < 12) suggestions.push("Build a longer, consistent operating history.");

  let basis: ValuationResult["basis"] = "insufficient_evidence";
  let basisAmount: number | null = null;
  let anchor = 0;
  if (input.monthlyProfit !== undefined && input.monthlyProfit > 0) { basis = "annual_profit"; basisAmount = input.monthlyProfit * 12; anchor = 3; }
  else if (recurring(input.businessModel) && arr > 0) { basis = "annual_recurring_revenue"; basisAmount = arr; anchor = 1.5; risks.push("The revenue method is less reliable without demonstrated profit."); }
  if (basis === "insufficient_evidence") {
    risks.push("Revenue or profit evidence is insufficient for a defensible financial valuation.");
    suggestions.push("Add revenue or profit history before relying on a financial estimate.");
    return { modelVersion: VALUATION_MODEL_VERSION, currency: input.currency, low: null, central: null, high: null,
      basis, basisAmount, impliedMultiple: null, confidence: "low", drivers, risks, suggestions, assumptions,
      methodology: "No dollar estimate is produced for pre-revenue apps or non-recurring businesses without profit. Traffic alone is not a proxy for sale value.", evidence: verified };
  }
  let factor = 1 + clamp(input.monthlyRevenueGrowthPct / 100, -0.18, 0.18);
  if (input.ageMonths < 6) factor -= 0.2; else if (input.ageMonths < 12) factor -= 0.1; else if (input.ageMonths >= 36) factor += 0.08;
  if (input.monthlyChurnPct !== undefined) factor += input.monthlyChurnPct < 3 ? 0.05 : input.monthlyChurnPct >= 7 ? -0.12 : 0;
  if (input.revenueConcentrationPct !== undefined && input.revenueConcentrationPct >= 40) factor -= 0.12;
  if (input.platformDependence === "high") factor -= 0.08;
  if (input.operationalComplexity === "high") factor -= 0.08;
  if (input.organicTrafficPct !== undefined && input.organicTrafficPct >= 60 && input.monthlyTraffic >= 1000) factor += 0.04;
  factor = clamp(factor, 0.55, 1.35);
  const multiple = Math.round(anchor * factor * 100) / 100;
  const central = round(basisAmount! * multiple), spread = basis === "annual_profit" ? 0.3 : 0.4;
  const low = Math.max(0, round(central * (1 - spread))), high = Math.max(low, round(central * (1 + spread)));
  let score = (basis === "annual_profit" ? 2 : 0) + (input.ageMonths >= 12 ? 1 : 0) + (verified.stripe ? 1 : 0) + (verified.ga4 ? 1 : 0)
    + (input.monthlyChurnPct !== undefined ? 1 : 0) + (input.revenueConcentrationPct !== undefined ? 1 : 0);
  if (risks.some((risk) => risk.includes("ARR and MRR disagree"))) score -= 2;
  const confidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
  assumptions.push("All inputs and outputs use the selected currency; no exchange rate or conversion is applied.");
  assumptions.push("One annual-profit or ARR multiple is adjusted for growth and disclosed risks; traffic and revenue are not added separately.");
  const methodology = basis === "annual_profit"
    ? `Annualized monthly profit × ${multiple.toFixed(2)}. The 3.0× starting point is illustrative, between published small-SaaS profit observations, adjusted for supplied risks and growth.`
    : `Annualized subscription revenue × ${multiple.toFixed(2)}. The 1.5× starting point is conservative because positive profit was not supplied.`;
  return { modelVersion: VALUATION_MODEL_VERSION, currency: input.currency, low, central, high, basis, basisAmount, impliedMultiple: multiple,
    confidence, drivers, risks, suggestions, assumptions, methodology, evidence: verified };
}
