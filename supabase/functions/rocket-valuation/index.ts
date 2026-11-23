import { createClient } from "npm:@supabase/supabase-js@2.101.1";
import { calculateValuation, type ValuationInputs } from "../../../src/lib/rocketValuation.ts";
import { verifiedGa4Metrics, verifiedStripeMrr } from "../../../src/lib/valuationVerifiedMetrics.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const auth = createClient(url, anonKey);
const service = createClient(url, serviceKey);
const origin = Deno.env.get("GA4_FRONTEND_ORIGIN") || "https://tryrocket.ai";
const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const close = (a: number, b: number) => Math.abs(a - b) < 0.011;

async function ownerStatus(provider: "rocket-stripe-revenue" | "rocket-ga4", action: string, appId: string, bearer: string) {
  const response = await fetch(`${url}/functions/v1/${provider}`, { method: "POST",
    headers: { Authorization: bearer, apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ action, app_id: appId, ...(provider === "rocket-stripe-revenue" ? { installation: "marketplace" } : {}) }),
    signal: AbortSignal.timeout(35_000) });
  if (!response.ok) throw new Error(provider === "rocket-ga4" ? "Google Analytics verification is unavailable. Reconnect or sync it and retry."
    : "Stripe verification is unavailable. Reconnect or sync it and retry.");
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") || 0) > 12_000) return json({ error: "Request too large" }, 413);
  try {
    const bearer = request.headers.get("authorization") || "";
    const token = bearer.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in first" }, 401);
    const { data: identity, error: identityError } = await auth.auth.getUser(token);
    if (identityError || !identity.user || identity.user.is_anonymous) return json({ error: "Sign in first" }, 401);
    const body = await request.json();
    if (body?.action !== "save" || !uuid(body.app_id) || !body.inputs || typeof body.inputs !== "object")
      return json({ error: "Invalid valuation request" }, 400);
    const { data: owner, error: ownerError } = await service.from("app_owners").select("verification_level")
      .eq("app_id", body.app_id).eq("user_id", identity.user.id).is("revoked_at", null).maybeSingle();
    if (ownerError || owner?.verification_level !== "domain_verified") return json({ error: "A domain-verified app owner is required" }, 403);
    const inputs = body.inputs as ValuationInputs;
    if ((inputs.appName !== undefined && typeof inputs.appName !== "string")
      || (inputs.appUrl !== undefined && typeof inputs.appUrl !== "string")) return json({ error: "Invalid app details" }, 400);
    const evidence = { stripe: body.evidence?.stripe === true, ga4: body.evidence?.ga4 === true };
    if (!evidence.stripe && !evidence.ga4) return json({ error: "No verified metrics selected" }, 400);
    if (evidence.stripe) {
      const stripe = await ownerStatus("rocket-stripe-revenue", "status", body.app_id, bearer);
      const mrr = verifiedStripeMrr(stripe, inputs.currency);
      if (!close(inputs.mrr, mrr) || (inputs.annualRecurringRevenue !== undefined && !close(inputs.annualRecurringRevenue, mrr * 12)))
        return json({ error: "Stripe revenue changed. Import it again before saving." }, 409);
    }
    if (evidence.ga4) {
      const ga4 = verifiedGa4Metrics(await ownerStatus("rocket-ga4", "valuation_snapshot", body.app_id, bearer));
      if (inputs.monthlyTraffic !== ga4.sessions || (inputs.organicTrafficPct !== undefined && !close(inputs.organicTrafficPct, ga4.organicSharePct))
        || (inputs.trafficGrowthPct !== undefined && ga4.trafficGrowthPct !== null && !close(inputs.trafficGrowthPct, ga4.trafficGrowthPct)))
        return json({ error: "Google Analytics metrics changed. Import them again before saving." }, 409);
    }
    const result = calculateValuation(inputs, evidence);
    const dataSources = [evidence.stripe && "stripe", evidence.ga4 && "ga4"].filter(Boolean);
    const inserted = await service.from("rocket_valuations").insert({ user_id: identity.user.id, app_id: body.app_id, inputs, result,
      currency: inputs.currency, low_amount: result.low, central_amount: result.central, high_amount: result.high,
      confidence: result.confidence, model_version: result.modelVersion,
      data_sources: dataSources, verification_status: "provider_verified" })
      .select("id,app_id,inputs,result,calculated_at").single();
    if (inserted.error) throw inserted.error;
    return json({ valuation: inserted.data });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Valuation save failed";
    const safe = message.startsWith("Stripe") || message.startsWith("Google Analytics") || message.includes("revenue") || message.includes("traffic")
      ? message : "Could not save the verified valuation. Please try again.";
    return json({ error: safe }, 400);
  }
});
