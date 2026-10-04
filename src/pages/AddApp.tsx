import { useEffect, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import AppLogo from "@/components/AppLogo";
import { track } from "@/lib/analytics";

type FoundApp = { id: string; name: string; description?: string | null; website_url: string; logo_url?: string | null; categories?: string[]; claim_state?: string };
type Job = { id: string; status: string; app_id?: string | null; error?: string | null; result?: Record<string, unknown> };
type Challenge = { status: string; claim_id?: string; challenge_id?: string; method?: string; host?: string; value?: string; token?: string; expires_at?: string; reason?: string };
const isSharedStoreUrl = (websiteUrl: string) => {
  try { return ["apps.apple.com", "play.google.com"].includes(new URL(websiteUrl).hostname.toLowerCase()); }
  catch { return false; }
};

function friendlyError(message: string) {
  if (/^Only ordinary public HTTP\(S\) websites are supported/i.test(message)) return "Only ordinary public HTTP(S) websites are supported. Try a different URL.";
  if (/invalid|unsupported|url|hostname/i.test(message)) return "Enter a public app website, Launch, GitHub, or Hacker News URL and try again.";
  if (/timeout|fetch|unavailable|network/i.test(message)) return "We couldn't read that page right now. Check the URL and try again.";
  if (/already.*claim|verified.*owner|ownership/i.test(message)) return "This app already has an owner. Request a review if you believe it should be yours.";
  return "Something went wrong. Please try again.";
}

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
  const [url, setUrl] = useState(params.get("url") || "");
  const [job, setJob] = useState<Job | null>(null);
  const [app, setApp] = useState<FoundApp | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resolvingApp, setResolvingApp] = useState(Boolean(appId));

  useEffect(() => { track("launch_started", { existing_app_link: Boolean(appId) }); }, [appId]);

  useEffect(() => {
    if (!appId) { setResolvingApp(false); return; }
    setResolvingApp(true);
    Promise.resolve(
      supabase.from("public_apps").select("id,name,description,website_url,logo_url,categories,claim_state")
        .eq("id", appId).maybeSingle(),
    ).then(async ({ data }) => {
        if (data) { setApp(data); return; }
        const own = await (supabase as any).from("app_jobs").select("result")
          .eq("app_id", appId).eq("status", "complete").limit(1).maybeSingle();
        if (own.data?.result && typeof own.data.result === "object") {
          const result = own.data.result as Record<string, unknown>;
          setApp({ id: appId, name: String(result.name || "New app"), website_url: String(result.website_url || ""),
            description: String(result.description || ""), logo_url: typeof result.logo_url === "string" ? result.logo_url : null });
        } else setError("This app was not found in your submissions.");
      }).catch(() => setError("This app could not be loaded. Please try again."))
      .finally(() => setResolvingApp(false));
  }, [appId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setJob(null);
    setApp(null);
    setChallenge(null);
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      track("launch_url_submitted", { source: "launch" });
      const next = await call("submit", { url });
      setJob(next);
      if (next.app_id) {
        if (next.result?.outcome === "existing") track("launch_existing_app_resolved", { app_id: next.app_id });
        if (next.result?.outcome === "new") track("launch_new_app_created", { app_id: next.app_id });
        const found = await supabase.from("public_apps").select("id,name,description,website_url,logo_url,categories,claim_state")
          .eq("id", next.app_id).maybeSingle();
        setApp(found.data || { id: next.app_id, name: String(next.result?.name || "New app"),
          description: String(next.result?.description || ""), website_url: String(next.result?.website_url || url),
          logo_url: typeof next.result?.logo_url === "string" ? next.result.logo_url : null });
      }
    } catch (cause) { setError(friendlyError((cause as Error).message)); }
    finally { setBusy(false); }
  };

  const startClaim = async (method: "dns_txt" | "https_well_known" | "manual_review") => {
    if (!app) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await call("claim", { app_id: app.id, method });
      setChallenge(result);
      track("app_claim_started", { app_id: app.id, method });
      if (result.challenge_id) track("app_verification_started", { app_id: app.id, method });
    }
    catch (cause) { setError(friendlyError((cause as Error).message)); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!challenge?.challenge_id || !challenge.token) return;
    setBusy(true); setError("");
    try {
      const result = await call("verify", { challenge_id: challenge.challenge_id, token: challenge.token });
      if (result.outcome === "verified") {
        track("app_verification_completed", { app_id: app?.id, method: challenge.method });
        track("app_claim_completed", { app_id: app?.id, method: challenge.method });
        setSuccess("Domain verified. This app is now in Your Apps."); setChallenge(null);
      }
      else setError("Ownership needs manual review.");
    } catch (cause) { setError(friendlyError((cause as Error).message)); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto max-w-3xl px-5 pb-24 pt-10 text-neutral-900 sm:px-8 sm:pt-16">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold tracking-[0.14em] text-sky-800">Rocket submission</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">Submit your app.</h1></div><Link to="/your-apps" className="inline-flex min-h-11 items-center text-sm font-medium text-sky-800 hover:underline">Your Apps</Link></div>
    {!appId && <form onSubmit={submit} className="mt-8 rounded-[1.75rem] border border-neutral-200 bg-white p-6 shadow-[0_16px_42px_-34px_rgba(15,23,42,0.35)] sm:p-9">
      <label htmlFor="app-url" className="block font-display text-2xl text-neutral-950 sm:text-3xl">Already launched somewhere?<span className="block">Paste the URL.</span></label>
      <input id="app-url" type="text" inputMode="url" required value={url} onChange={(event) => setUrl(event.target.value)}
          autoComplete="url" placeholder="https://your-app.com" className="mt-6 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base focus:border-sky-500 focus:outline-hidden focus:ring-2 focus:ring-sky-200" />
      <button disabled={busy} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-neutral-900 px-6 text-sm font-semibold text-white transition hover:bg-neutral-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50">
        {busy ? "Finding your app…" : "Continue"}
      </button>
      <p className="mt-5 text-sm leading-relaxed text-neutral-600">Website · Launch · GitHub · Hacker News</p><p className="mt-1 text-sm text-neutral-500">You can review the match before claiming your app.</p>
    </form>}
    {resolvingApp && <div role="status" aria-label="Loading app" className="rocket-skeleton-surface mt-7 h-44 animate-pulse rounded-[1.5rem] border border-neutral-200 p-6"><div className="h-14 w-14 rounded-2xl bg-neutral-100" /></div>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">{success}</p>}
    {job?.status === "needs_review" && <div className="mt-6 rounded-xl border bg-white p-6">
      <h2 className="font-semibold">We found more than one possible app</h2><p className="mt-2 text-sm text-neutral-600">We won't guess which one is yours. Review the URL or contact Rocket for help.</p>
    </div>}
    {job?.status === "failed" && <p className="mt-5 text-sm text-neutral-600">We could not read that URL. Check it and try again.</p>}
    {app && !resolvingApp && <div className="mt-7 rounded-[1.5rem] border border-neutral-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-semibold text-sky-700">{job?.result?.outcome === "existing" || appId ? "This app is already on Rocket" : "We found your app"}</p>
      <div className="mt-5 flex min-w-0 items-center gap-4"><AppLogo name={app.name} src={app.logo_url} className="h-14 w-14" />
        <div className="min-w-0"><h2 className="line-clamp-1 text-xl font-semibold">{app.name}</h2><a href={app.website_url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-sky-800 hover:underline">{app.website_url}</a></div></div>
      {app.description && <p className="mt-4 text-sm text-neutral-600">{app.description}</p>}
      {!!app.categories?.length && <p className="mt-3 text-xs text-neutral-500">{app.categories.join(" · ")}</p>}
      <div className="mt-6 border-t pt-5">
        <h3 className="font-semibold">{app.claim_state === "domain_verified" ? "Already claimed" : "Verify this app"}</h3>
        <p className="mt-1 text-sm text-neutral-600">{app.claim_state === "domain_verified"
          ? "This app already has a verified claimant. If you believe you own it, request ownership review; Rocket will not transfer it automatically."
          : isSharedStoreUrl(app.website_url)
            ? "Apple and Google own this store domain, so its DNS or website file cannot prove you own this app. Request a review or add your own app website URL."
            : "A Rocket login alone does not prove ownership. Verify control of the app’s website."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {app.claim_state !== "domain_verified" && <>{!isSharedStoreUrl(app.website_url) && <><button disabled={busy} onClick={() => startClaim("dns_txt")} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Verify domain (DNS)</button>
          <button disabled={busy} onClick={() => startClaim("https_well_known")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Use website file</button></>}
          <button disabled={busy} onClick={() => startClaim("manual_review")} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Request manual review</button>
          </>}
        </div>
      </div>
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
