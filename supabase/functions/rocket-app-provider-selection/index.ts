import { createClient } from "npm:@supabase/supabase-js@2.101.1";

const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
const origin = Deno.env.get("APP_URL") || "https://tryrocket.ai";
const headers = { "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS", "Cache-Control": "no-store", Vary: "Origin" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...headers, "Content-Type": "application/json" },
});
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const providers = {
  analytics: ["ga4", "posthog"],
  revenue: ["stripe", "revenuecat", "polar", "dodo"],
} as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in to continue" }, 401);
    const user = await auth.auth.getUser(token);
    if (user.error || !user.data.user || user.data.user.is_anonymous)
      return json({ error: "Sign in to continue" }, 401);
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Invalid request" }, 400);
    if (!uuid(body.app_id)) return json({ error: "Invalid app" }, 400);
    const owner = await service.from("app_owners").select("app_id,verification_level")
      .eq("app_id", body.app_id).eq("user_id", user.data.user.id)
      .is("revoked_at", null).maybeSingle();
    if (owner.error || owner.data?.verification_level !== "domain_verified")
      return json({ error: "A domain-verified app owner is required" }, 403);

    if (body.action === "select") {
      const kind = body.kind;
      if (kind !== "analytics" && kind !== "revenue") return json({ error: "Invalid provider kind" }, 400);
      const allowed: readonly string[] = providers[kind];
      if (body.provider !== null && !allowed.includes(body.provider))
        return json({ error: "Invalid provider" }, 400);
      const current = await service.from("app_provider_selection")
        .select("analytics_provider,revenue_provider").eq("app_id", body.app_id).maybeSingle();
      if (current.error) throw current.error;
      const previous = kind === "analytics"
        ? current.data?.analytics_provider ?? null : current.data?.revenue_provider ?? null;
      if (body.expected_previous !== previous)
        return json({ error: "Provider choice changed; reload and try again" }, 409);
      if (previous && previous !== body.provider && body.confirm_switch !== true)
        return json({ error: "Confirm the provider switch" }, 400);
      // Alternative providers select themselves only after a validated first
      // sync commits the mapping and choice in one database transaction.
      if (["posthog", "revenuecat", "polar", "dodo"].includes(String(body.provider)))
        return json({ error: "Connect and verify this provider before selecting it" }, 400);
      if (body.provider === "ga4") {
        const connection = await service.from("app_data_connections")
          .select("id,status,last_successful_sync").eq("app_id", body.app_id)
          .eq("owner_user_id", user.data.user.id).eq("provider", "ga4").maybeSingle();
        if (connection.error || connection.data?.status !== "active"
          || !connection.data.last_successful_sync
          || Date.now() - Date.parse(connection.data.last_successful_sync) >= 72 * 60 * 60 * 1000)
          return json({ error: "Sync Google Analytics before selecting it" }, 400);
        const point = await service.from("app_metric_points").select("id")
          .eq("connection_id", connection.data.id).eq("provider", "ga4")
          .eq("verification_status", "verified").limit(1);
        if (point.error || !point.data?.length)
          return json({ error: "Google Analytics has no verified data" }, 400);
      }
      if (body.provider === "stripe") {
        const binding = await service.from("app_revenue_bindings")
          .select("connection_id,mapping_version").eq("app_id", body.app_id)
          .eq("owner_user_id", user.data.user.id).maybeSingle();
        if (binding.error || !binding.data)
          return json({ error: "Map Stripe revenue before selecting it" }, 400);
        const connection = await service.from("app_revenue_connections")
          .select("status,livemode,last_successful_sync").eq("id", binding.data.connection_id)
          .eq("owner_user_id", user.data.user.id).maybeSingle();
        if (connection.error || connection.data?.status !== "active" || !connection.data.livemode
          || !connection.data.last_successful_sync
          || Date.now() - Date.parse(connection.data.last_successful_sync) >= 72 * 60 * 60 * 1000)
          return json({ error: "Sync live Stripe revenue before selecting it" }, 400);
        const point = await service.from("app_revenue_metric_points").select("id")
          .eq("app_id", body.app_id).eq("connection_id", binding.data.connection_id)
          .eq("mapping_version", binding.data.mapping_version)
          .eq("verification_status", "verified").eq("source_livemode", true).limit(1);
        if (point.error || !point.data?.length)
          return json({ error: "Stripe has no verified live revenue snapshot" }, 400);
      }
      const result = await service.rpc("select_verified_app_provider", {
        p_app_id: body.app_id, p_owner_user_id: user.data.user.id,
        p_kind: kind, p_provider: body.provider,
        p_expected_previous: body.expected_previous,
        p_confirm_switch: body.confirm_switch === true,
      });
      if (result.error) throw result.error;
    } else if (body.action !== "status") {
      return json({ error: "Invalid action" }, 400);
    }

    const [selection, traffic, revenue, alternative] = await Promise.all([
      service.from("app_provider_selection").select("analytics_provider,revenue_provider")
        .eq("app_id", body.app_id).eq("owner_user_id", user.data.user.id).maybeSingle(),
      service.from("app_data_connections").select("provider,status")
        .eq("app_id", body.app_id).eq("owner_user_id", user.data.user.id),
      service.from("app_revenue_bindings").select("connection_id")
        .eq("app_id", body.app_id).eq("owner_user_id", user.data.user.id).maybeSingle(),
      service.from("app_verified_revenue_sources").select("provider,connection_id")
        .eq("app_id", body.app_id).eq("owner_user_id", user.data.user.id).maybeSingle(),
    ]);
    if (selection.error || traffic.error || revenue.error || alternative.error)
      throw new Error("Connection status unavailable");
    let stripe = false;
    if (revenue.data?.connection_id) {
      const connected = await service.from("app_revenue_connections").select("status")
        .eq("id", revenue.data.connection_id).eq("owner_user_id", user.data.user.id).maybeSingle();
      if (connected.error) throw connected.error;
      stripe = connected.data?.status === "active";
    }
    let revenuecat = false;
    if (alternative.data?.provider === "revenuecat") {
      const linked = await service.from("app_verified_revenue_connections").select("status")
        .eq("id", alternative.data.connection_id)
        .eq("owner_user_id", user.data.user.id).maybeSingle();
      if (linked.error) throw linked.error;
      revenuecat = linked.data?.status === "active";
    }
    return json({
      analytics_provider: selection.data?.analytics_provider ?? null,
      revenue_provider: selection.data?.revenue_provider ?? null,
      connected: {
        ga4: traffic.data?.some((item) => item.provider === "ga4" && item.status === "active") ?? false,
        posthog: traffic.data?.some((item) => item.provider === "posthog" && item.status === "active") ?? false,
        stripe, revenuecat, polar: false, dodo: false,
      },
    });
  } catch {
    return json({ error: "Provider choice unavailable" }, 503);
  }
});
