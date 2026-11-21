import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  EscrowApiError,
  EscrowComClient,
  verifyAndMap,
  type EscrowEnvironment,
  type EscrowTerms,
  type EscrowTransaction,
} from "../_shared/escrowCom.ts";
import { diagnosticErrorCategory, diagnosticResult } from "../_shared/escrowAuthDiagnostic.ts";

const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const credentials = {
  sandbox: {
    email: (Deno.env.get("ESCROW_SANDBOX_EMAIL") ?? "").trim(),
    key: Deno.env.get("ESCROW_SANDBOX_API_KEY") ?? "",
  },
  production: {
    email: (Deno.env.get("ESCROW_PRODUCTION_EMAIL") ?? "").trim(),
    key: Deno.env.get("ESCROW_PRODUCTION_API_KEY") ?? "",
  },
};
const testUsers = new Set(
  (Deno.env.get("ROCKET_ESCROW_SANDBOX_TEST_USERS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);
const sandboxEnabled = Deno.env.get("ROCKET_ESCROW_SANDBOX_ENABLED") === "true";
const webhookToken = Deno.env.get("ROCKET_ESCROW_WEBHOOK_TOKEN") ?? "";
const origin = "https://tryrocket.ai";
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const admin = createClient(projectUrl, serviceKey);
const client = (environment: EscrowEnvironment) =>
  new EscrowComClient(environment, credentials[environment].email, credentials[environment].key);
type Claim = {
  claimed: boolean;
  reference: string;
  transaction_id: number | null;
  buyer_email: string;
  seller_email: string;
  app_name: string;
  price_minor: number;
  buyer_fee_minor: number;
  seller_fee_minor: number;
};

async function termsForDeal(dealId: string, environment: EscrowEnvironment): Promise<EscrowTerms> {
  const [{ data: finance }, { data: identity }, { data: escrow }] =
    await Promise.all([
      admin
        .from("rocket_deal_financials")
        .select(
          "acquisition_price_minor,currency,buyer_fee_minor,seller_fee_minor",
        )
        .eq("deal_id", dealId)
        .single(),
      admin
        .from("rocket_deal_escrow_identity")
        .select("buyer_email,seller_email,app_name,inspection_days")
        .eq("deal_id", dealId)
        .single(),
      admin
        .from("rocket_deal_escrow")
        .select("reference,environment")
        .eq("deal_id", dealId)
        .single(),
    ]);
  if (
    !finance ||
    !identity ||
    !escrow ||
    escrow.environment !== environment ||
    finance.currency !== "USD"
  )
    throw new Error("Escrow terms unavailable");
  return {
    reference: escrow.reference,
    appName: identity.app_name,
    buyerEmail: identity.buyer_email,
    sellerEmail: identity.seller_email,
    brokerEmail: credentials[environment].email,
    priceMinor: finance.acquisition_price_minor,
    buyerFeeMinor: finance.buyer_fee_minor,
    sellerFeeMinor: finance.seller_fee_minor,
    inspectionDays: identity.inspection_days,
  };
}

async function apply(
  dealId: string,
  transaction: EscrowTransaction,
  terms: EscrowTerms,
  environment: EscrowEnvironment,
) {
  const snapshot = verifyAndMap(transaction, terms, environment);
  const { error } = await admin.rpc("rocket_escrow_apply_snapshot", {
    p_deal_id: dealId,
    p_transaction_id: transaction.id,
    p_snapshot: snapshot,
  });
  if (error) throw new Error("Escrow reconciliation rejected");
  return snapshot;
}
async function reconcile(dealId: string, transactionId: number) {
  const { data: linked } = await admin.from("rocket_deal_escrow")
    .select("environment,transaction_id").eq("deal_id", dealId).single();
  if (!linked || linked.transaction_id !== transactionId ||
    !["sandbox", "production"].includes(linked.environment))
    throw new Error("Escrow transaction mismatch");
  const environment = linked.environment as EscrowEnvironment;
  const terms = await termsForDeal(dealId, environment);
  const transaction = await client(environment).byId(transactionId);
  return apply(dealId, transaction, terms, environment);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  if (!projectUrl || !anonKey || !serviceKey)
    return json({ error: "Escrow backend unavailable" }, 503);
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096)
      return json({ error: "Request too large" }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: "Request too large" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  // Escrow.com documents no webhook signature. A private URL token limits
  // unsolicited calls; every event is treated only as a hint to fetch live state.
  if (new URL(request.url).searchParams.has("webhook")) {
    const token = new URL(request.url).searchParams.get("webhook");
    if (!webhookToken || !token || token !== webhookToken)
      return json({ error: "Forbidden" }, 403);
    if (
      body.event_type !== "transaction" ||
      !Number.isSafeInteger(body.transaction_id) ||
      Number(body.transaction_id) <= 0
    )
      return json({ error: "Invalid event" }, 400);
    const environment = new URL(request.url).searchParams.get("environment") === "sandbox"
      ? "sandbox" : "production";
    const { data: linked } = await admin
      .from("rocket_deal_escrow")
      .select("deal_id,transaction_id,last_synced_at")
      .eq("transaction_id", body.transaction_id)
      .eq("environment", environment)
      .maybeSingle();
    if (!linked) return json({ ok: true });
    if (
      linked.last_synced_at &&
      Date.now() - Date.parse(linked.last_synced_at) < 5000
    )
      return json({ ok: true });
    try {
      await reconcile(linked.deal_id, linked.transaction_id);
      return json({ ok: true });
    } catch {
      await admin.rpc("rocket_escrow_record_sync_error", {
        p_deal_id: linked.deal_id,
        p_error: "Webhook reconciliation failed",
      });
      return json({ error: "Reconciliation unavailable" }, 503);
    }
  }

  const jwt = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const diagnostic = body.action === "diagnose_auth";
  if (!jwt) return diagnostic ? json(diagnosticResult(false, "unauthorized"), 401) : json({ error: "Unauthorized" }, 401);
  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: identity, error: identityError } =
    await userClient.auth.getUser(jwt);
  if (identityError || !identity.user)
    return diagnostic ? json(diagnosticResult(false, "unauthorized"), 401) : json({ error: "Unauthorized" }, 401);
  if (diagnostic) {
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_rocket_admin");
    if (adminError) return json(diagnosticResult(false, "internal_error"), 503);
    if (isAdmin !== true) return json(diagnosticResult(false, "forbidden"), 403);
    if (!credentials.production.email || !credentials.production.key)
      return json(diagnosticResult(false, "not_configured"), 503);
    const { data: reserved, error: reserveError } = await admin.rpc("rocket_escrow_auth_diagnostic_reserve", {
      p_admin: identity.user.id,
    });
    if (reserveError) return json(diagnosticResult(false, "internal_error"), 503);
    if (reserved !== true) return json(diagnosticResult(false, "rate_limited"), 429);
    try {
      await client("production").verifyAccount();
      return json(diagnosticResult(true, null));
    } catch (error) {
      return json(diagnosticResult(false, diagnosticErrorCategory(error)), 503);
    }
  }
  const dealId = body.deal_id;
  if (typeof dealId !== "string" || !uuid.test(dealId))
    return json({ error: "Invalid deal" }, 400);
  const { data: isAdmin } = await userClient.rpc("is_rocket_admin");
  const { data: deal } =
    isAdmin === true
      ? await admin
          .from("rocket_deals")
          .select("id,buyer_id,seller_id")
          .eq("id", dealId)
          .maybeSingle()
      : await userClient
          .from("rocket_deals")
          .select("id,buyer_id,seller_id")
          .eq("id", dealId)
          .maybeSingle();
  if (!deal) return json({ error: "Deal not found" }, 404);
  const participant = [deal.buyer_id, deal.seller_id].includes(
    identity.user.id,
  );
  if (!participant && isAdmin !== true)
    return json({ error: "Forbidden" }, 403);
  const sandboxAvailable =
    sandboxEnabled &&
    testUsers.has(deal.buyer_id) &&
    testUsers.has(deal.seller_id) &&
    !!credentials.sandbox.email &&
    !!credentials.sandbox.key;
  const productionAvailable = !!credentials.production.email && !!credentials.production.key;
  if (body.action === "availability")
    return json({ sandbox_available: sandboxAvailable, production_available: productionAvailable });
  if (body.action !== "create" && body.action !== "sync")
    return json({ error: "Invalid action" }, 400);
  if (body.action === "create" && !participant)
    return json({ error: "Only a deal participant can start escrow" }, 403);
  const { data: linked } = await admin
    .from("rocket_deal_escrow")
    .select("*")
    .eq("deal_id", dealId)
    .maybeSingle();
  const environment: EscrowEnvironment = linked?.environment === "sandbox"
    ? "sandbox" : "production";
  if (environment === "production" ? !productionAvailable : !sandboxAvailable)
    return json({ error: "Escrow is unavailable for this deal" }, 503);
  if (body.action === "sync") {
    if (!linked?.transaction_id)
      return json({ error: "Escrow transaction not created" }, 409);
    if (
      linked.last_synced_at &&
      Date.now() - Date.parse(linked.last_synced_at) < 30000
    )
      return json({ ok: true, rate_limited: true });
    try {
      return json({
        ok: true,
        snapshot: await reconcile(dealId, linked.transaction_id),
      });
    } catch {
      await admin.rpc("rocket_escrow_record_sync_error", {
        p_deal_id: dealId,
        p_error: "Participant status sync failed",
      });
      return json({ error: "Escrow status could not be verified" }, 503);
    }
  }
  let claim: Claim;
  try {
    // Verify live credentials before the one-time database claim. A bad key
    // must not strand an otherwise eligible deal in reconciliation_required.
    await client(environment).verifyAccount();
    const result = await admin.rpc("rocket_escrow_claim", {
      p_deal_id: dealId,
      p_actor: identity.user.id,
      p_environment: environment,
    });
    if (result.error || !result.data)
      return json({ error: "Deal is not eligible for escrow" }, 409);
    claim = result.data as Claim;
  } catch {
    return json({ error: "Escrow initiation unavailable" }, 503);
  }
  if (claim.transaction_id)
    return json({ ok: true, transaction_id: claim.transaction_id });
  try {
    const terms = await termsForDeal(dealId, environment);
    const provider = client(environment);
    // The reference is a reconciliation key, not a documented idempotency key.
    // Once creation is claimed, never POST a second time on timeout or 404.
    try {
      const found = await provider.byReference(claim.reference);
      const snapshot = await apply(dealId, found, terms, environment);
      return json({ ok: true, transaction_id: found.id, snapshot });
    } catch (error) {
      if (!(error instanceof EscrowApiError && error.status === 404))
        throw error;
      if (!claim.claimed)
        return json(
          { error: "Provider outcome needs manual reconciliation" },
          409,
        );
    }
    const created = await provider.create(terms);
    const verified = await provider.byId(created.id);
    const snapshot = await apply(dealId, verified, terms, environment);
    return json({ ok: true, transaction_id: verified.id, snapshot });
  } catch {
    await admin
      .from("rocket_deal_escrow")
      .update({
        attempt_status: "reconciliation_required",
        last_error: "Provider request or reconciliation failed",
        updated_at: new Date().toISOString(),
      })
      .eq("deal_id", dealId)
      .is("transaction_id", null);
    return json(
      {
        error:
          "Escrow outcome requires review. No second transaction will be created.",
      },
      503,
    );
  }
});
