import { fileURLToPath } from "node:url";

const origin = "https://lcujmvdgczkjxdstzhnr.supabase.co";

export async function sendFounderOutreach({ key, dryRun = true, request = fetch, now = new Date() }) {
  if (!key || key.length < 32) throw new Error("Rocket server credential is missing");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function api(path, body) {
    const response = await request(origin + path, {
      method: body === undefined ? "GET" : "POST", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60000),
    });
    // Do not retry or log response bodies: they may contain recipient details or tokens.
    if (!response.ok) throw new Error(`Outreach request failed (${response.status}); stopped without retry`);
    return response.json();
  }
  const [control] = await api("/rest/v1/rocket_outreach_control?id=eq.true&select=paused,send_mode,production_authorized,daily_limit,hourly_limit");
  if (!control || control.paused || control.send_mode !== "production" || !control.production_authorized) {
    return { accepted: 0, reason: "Campaign paused or not authorized", dryRun };
  }
  const since = new Date(now.getTime() - 86400000).toISOString();
  const attempts = await api(`/rest/v1/rocket_outreach_send_attempts?send_mode=eq.production&reserved_at=gte.${encodeURIComponent(since)}&select=reserved_at&limit=101`);
  const hourly = attempts.filter((attempt) => Date.parse(attempt.reserved_at) >= now.getTime() - 3600000).length;
  const budget = Math.max(0, Math.min(10, control.daily_limit - attempts.length, control.hourly_limit - hourly));
  if (!Number.isFinite(budget)) throw new Error("Invalid campaign limits");
  if (!budget) return { accepted: 0, reason: "Rolling send limit reached", dryRun };
  const candidates = await api("/rest/v1/rpc/rocket_admin_outreach_first_batch", {});
  if (!Array.isArray(candidates)) throw new Error("Invalid outreach batch");
  const batch = candidates.slice(0, budget);
  if (dryRun) return { accepted: 0, eligibleInBatch: batch.length, remainingBudget: budget, dryRun: true };
  let accepted = 0;
  for (const candidate of batch) {
    if (!/^[0-9a-f-]{36}$/i.test(candidate.id || "")) throw new Error("Invalid queue item");
    try {
      const result = await api("/functions/v1/rocket-founder-outreach-test", { queue_id: candidate.id });
      if (result.ok !== true || result.test_only !== false) throw new Error("Unconfirmed production delivery");
      accepted++;
    } catch {
      throw new Error(`Outreach stopped after ${accepted} accepted invitation(s); check delivery records before retrying`);
    }
  }
  return { accepted, dryRun: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await sendFounderOutreach({
      key: process.env.ROCKET_SUPABASE_SERVICE_ROLE_KEY,
      dryRun: process.env.OUTREACH_DRY_RUN !== "false",
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
