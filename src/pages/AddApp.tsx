import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type FoundApp = { id: string; name: string; description?: string | null; website_url: string; logo_url?: string | null; categories?: string[]; claim_state?: string };
type Job = { id: string; status: string; app_id?: string | null; error?: string | null; result?: Record<string, unknown> };
type Challenge = { status: string; claim_id?: string; challenge_id?: string; method?: string; host?: string; value?: string; token?: string; expires_at?: string; reason?: string };

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("rocket-apps", { body: { action, ...body } });
  if (error) {
    const response = (error as { context?: Response }).context;
    let detail = "";
    if (response && typeof response.json === "function") {
      try { detail = (await response.json()).error || ""; } catch { /* response may not be JSON */ }
    }
    throw new Error(detail || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function AddApp() {
  const [params] = useSearchParams();
  const appId = params.get("app");
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [app, setApp] = useState<FoundApp | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!appId) return;
    supabase.from("public_apps").select("id,name,description,website_url,logo_url,categories,claim_state")
      .eq("id", appId).maybeSingle().then(async ({ data }) => {
        if (data) { setApp(data); return; }
        const own = await supabase.from("app_jobs" as "public_apps").select("result")
          .eq("app_id", appId).eq("status", "complete").limit(1).maybeSingle();
        if (own.data?.result && typeof own.data.result === "object") {
          const result = own.data.result as Record<string, unknown>;
          setApp({ id: appId, name: String(result.name || "New app"), website_url: String(result.website_url || ""),
            description: String(result.description || ""), logo_url: typeof result.logo_url === "string" ? result.logo_url : null });
        } else setError("This app was not found in your submissions.");
      });
  }, [appId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setSuccess(""); setBusy(true);
    try {
      const next = await call("submit", { url });
      setJob(next);
      if (next.app_id) {
        const found = await supabase.from("public_apps").select("id,name,description,website_url,logo_url,categories,claim_state")
          .eq("id", next.app_id).maybeSingle();
        setApp(found.data || { id: next.app_id, name: String(next.result?.name || "New app"),
          description: String(next.result?.description || ""), website_url: String(next.result?.website_url || url),
          logo_url: typeof next.result?.logo_url === "string" ? next.result.logo_url : null });
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const startClaim = async (method: "dns_txt" | "https_well_known" | "manual_review") => {
    if (!app) return;
    setBusy(true); setError(""); setSuccess("");
    try { setChallenge(await call("claim", { app_id: app.id, method })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!challenge?.challenge_id || !challenge.token) return;
    setBusy(true); setError("");
    try {
      const result = await call("verify", { challenge_id: challenge.challenge_id, token: challenge.token });
      if (result.outcome === "verified") { setSuccess("Domain verified. This app is now in My Apps."); setChallenge(null); }
      else setError("Ownership needs manual review.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto max-w-3xl px-6 py-10 text-neutral-900">
    <div className="flex items-center justify-between"><h1 className="font-display text-3xl">Add your app</h1><Link to="/my-apps" className="text-sm text-sky-700 hover:underline">My Apps</Link></div>
    {!appId && <form onSubmit={submit} className="mt-8 rounded-2xl border bg-white p-6">
      <label htmlFor="app-url" className="block text-sm font-medium">Paste your app or launch URL</label>
      <input id="app-url" type="text" inputMode="url" required value={url} onChange={(event) => setUrl(event.target.value)}
        placeholder="https://your-app.com" className="mt-3 w-full rounded-xl border px-4 py-3 text-sm" />
      <button disabled={busy} className="mt-4 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Finding your app…" : "Find my app"}
      </button>
      <p className="mt-3 text-xs text-neutral-500">Rocket reads public website information. You will review the result before claiming it.</p>
    </form>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}
    {job?.status === "needs_review" && <div className="mt-6 rounded-xl border bg-white p-6">
      <h2 className="font-semibold">This needs a closer look</h2><p className="mt-2 text-sm text-neutral-600">{job.error || "Rocket found more than one possible match and did not merge them."}</p>
    </div>}
    {job?.status === "failed" && <p className="mt-5 text-sm text-neutral-600">{job.error || "We could not read that URL. You can retry safely."}</p>}
    {app && <div className="mt-7 rounded-2xl border bg-white p-6">
      <p className="text-sm font-semibold text-sky-700">{job?.result?.outcome === "existing" || appId ? "This app is already on Rocket" : "We found your app"}</p>
      <div className="mt-5 flex items-center gap-4">{app.logo_url ? <img src={app.logo_url} alt="" className="h-14 w-14 rounded-xl object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-100 text-xl">{app.name[0]}</div>}
        <div><h2 className="text-xl font-semibold">{app.name}</h2><a href={app.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-700 hover:underline">{app.website_url}</a></div></div>
      {app.description && <p className="mt-4 text-sm text-neutral-600">{app.description}</p>}
      {!!app.categories?.length && <p className="mt-3 text-xs text-neutral-500">{app.categories.join(" · ")}</p>}
      {app.claim_state === "domain_verified" ? <p className="mt-5 text-sm text-green-700">Domain verified</p> : <div className="mt-6 border-t pt-5">
        <h3 className="font-semibold">Verify this app</h3><p className="mt-1 text-sm text-neutral-600">A Rocket login alone does not prove ownership. Verify control of the app’s website.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => startClaim("dns_txt")} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Verify domain (DNS)</button>
          <button disabled={busy} onClick={() => startClaim("https_well_known")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Use website file</button>
          <button disabled={busy} onClick={() => startClaim("manual_review")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Request manual review</button>
        </div>
      </div>}
      {challenge?.status === "review" && <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">{challenge.reason}</p>}
      {challenge?.status === "verified" && <p className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-800">{challenge.reason}</p>}
      {challenge?.challenge_id && <div className="mt-5 rounded-xl bg-neutral-50 p-5 text-sm">
        <p className="font-semibold">{challenge.method === "dns_txt" ? "Add this TXT record to your domain" : "Place this text at the exact URL"}</p>
        <p className="mt-3 text-neutral-600">{challenge.method === "dns_txt" ? "Type: TXT · Host:" : "URL:"}</p><code className="block break-all">{challenge.host}</code>
        <p className="mt-3 text-neutral-600">Value:</p><code className="block break-all">{challenge.value}</code>
        <button onClick={() => navigator.clipboard.writeText(challenge.value || "")} className="mt-2 text-sky-700">Copy value</button>
        <p className="mt-3 text-xs text-neutral-500">Expires {new Date(challenge.expires_at || "").toLocaleString()}.</p>
        <button disabled={busy} onClick={verify} className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-white disabled:opacity-50">{busy ? "Checking…" : "Verify"}</button>
      </div>}
    </div>}
  </main>;
}
