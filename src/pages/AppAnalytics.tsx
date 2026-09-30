import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";

type Visibility = "private" | "verified_only" | "range" | "exact";
type Metric = "active_users" | "sessions" | "views";
type Property = { id: string; name: string };
type Stream = { id: string; name: string; hostname: string | null; matches_app: boolean };
type Status = { connection: null | { status: string; property_name: string | null; verified_hostname: string | null;
  last_attempted_sync: string | null; last_successful_sync: string | null; last_error: string | null };
  visibility: Array<{ metric_type: Metric; visibility: Visibility }>;
  latest?: Array<{ metric_type: Metric; metric_date: string; metric_value: number }>;
  growth?: Record<string, { seven_day: number | null; thirty_day: number | null }> };
const metrics: Array<{ id: Metric; label: string }> = [
  { id: "active_users", label: "Active users" }, { id: "sessions", label: "Sessions" }, { id: "views", label: "Views" },
];
const choices: Array<{ id: Visibility; label: string }> = [
  { id: "private", label: "Private" }, { id: "verified_only", label: "Verified only" },
  { id: "range", label: "Range" }, { id: "exact", label: "Exact" },
];

export default function AppAnalytics() {
  const { id } = useParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invocationError } = await supabase.functions.invoke("rocket-ga4", { body: { action, app_id: id, ...extra } });
    if (invocationError || data?.error) throw new Error(data?.error || invocationError?.message || "Google Analytics request failed");
    return data;
  }, [id]);
  const refresh = useCallback(async () => setStatus(await request("status") as Status), [request]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ga4") === "error") setError("Google authorization could not be completed. Please try connecting again.");
    refresh().catch((cause) => setError((cause as Error).message));
  }, [refresh]);
  useEffect(() => {
    if (status?.connection?.status !== "select_property") return;
    request("properties").then((data) => setProperties(data.properties || [])).catch((cause) => setError((cause as Error).message));
  }, [status?.connection?.status, request]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  };
  const visible = (metric: Metric) => status?.visibility.find((item) => item.metric_type === metric)?.visibility || "private";
  return <main className="mx-auto max-w-3xl px-6 py-10 text-neutral-900">
    <Link to="/my-apps" className="text-sm text-sky-700">← My Apps</Link>
    <h1 className="mt-5 font-display text-3xl">Traffic connection</h1>
    <p className="mt-2 text-sm text-neutral-600">Connect a Google Analytics 4 web stream for this domain-verified app. Rocket reads traffic only. Every metric remains private until you choose otherwise.</p>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">Google Analytics</h2>
      {!status && !error && <div role="status" aria-label="Loading connection" className="mt-3 animate-pulse space-y-2"><div className="h-4 w-44 rounded bg-neutral-100" /><div className="h-4 w-64 max-w-full rounded bg-neutral-100" /></div>}
      {status && <>
        <p className="mt-2 text-sm text-neutral-600">{status.connection ? `${status.connection.status.replaceAll("_", " ")} · ${status.connection.property_name || "Property not selected"}` : "Not connected"}</p>
        {status.connection?.verified_hostname && <p className="mt-1 text-xs text-neutral-500">Verified stream host: {status.connection.verified_hostname}</p>}
        {status.connection?.last_successful_sync && <p className="mt-1 text-xs text-neutral-500">Last successful sync: {new Date(status.connection.last_successful_sync).toLocaleString()}</p>}
        {(["sessions", "views"] as const).map((metric) => status.growth?.[metric]?.seven_day != null && <p key={metric} className="mt-1 text-xs text-neutral-500">{metric === "sessions" ? "Sessions" : "Views"}: {status.growth[metric].seven_day! > 0 ? "+" : ""}{status.growth[metric].seven_day}% versus the preceding complete 7 days</p>)}
        {status.connection?.last_error && <p className="mt-2 text-sm text-amber-700">Sync needs attention: {status.connection.last_error}</p>}
        {(!status.connection || status.connection.status === "disconnected") && <button disabled={busy} onClick={() => run(async () => {
          const result = await request("start"); window.location.assign(result.authorization_url);
        })} className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">Connect Google Analytics</button>}
        {status.connection?.status === "select_property" && <div className="mt-5 space-y-4">
          <label className="block text-sm">GA4 property
            <select value={propertyId} onChange={(event) => { const next = event.target.value; setPropertyId(next); setStreamId(""); setStreams([]);
              if (next) run(async () => { const data = await request("streams", { property_id: next }); setStreams(data.streams || []); }); }} className="mt-2 block w-full rounded-lg border p-2">
              <option value="">Select a property</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {propertyId && <label className="block text-sm">Web stream matching this app
            <select value={streamId} onChange={(event) => setStreamId(event.target.value)} className="mt-2 block w-full rounded-lg border p-2">
              <option value="">Select a matching stream</option>{streams.map((item) => <option key={item.id} value={item.id} disabled={!item.matches_app}>{item.name || item.hostname} · {item.hostname || "No host"}{!item.matches_app ? " · different domain" : ""}</option>)}
            </select>
          </label>}
          {propertyId && streams.length > 0 && !streams.some((item) => item.matches_app) && <p className="text-sm text-amber-700">No web stream matches this app’s verified domain. This property cannot be verified for this app.</p>}
          <button disabled={busy || !streamId} onClick={() => run(async () => { const result = await request("select_property", { property_id: propertyId, stream_id: streamId });
            setNotice(`Verified and backfilled ${result.sync.days} days of traffic. All metrics remain private.`); await refresh(); })}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50">Verify and backfill traffic</button>
        </div>}
        {status.connection && ["active", "error"].includes(status.connection.status) && <button disabled={busy} onClick={() => run(async () => {
          await request("retry_sync"); setNotice("Traffic synced."); await refresh();
        })} className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Sync now</button>}
        {status.connection && status.connection.status !== "disconnected" && <button disabled={busy} onClick={() => {
          if (!window.confirm("Disconnect Google Analytics? Historical private points are retained, but public verification is removed.")) return;
          run(async () => { await request("disconnect"); setProperties([]); setStreams([]); setNotice("Disconnected. Public traffic verification has been removed."); await refresh(); });
        }} className="ml-2 mt-4 rounded-xl border px-4 py-2 text-sm text-red-700 disabled:opacity-50">Disconnect</button>}
      </>}
    </section>
    {status?.connection?.status === "active" && <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="font-semibold">Public visibility</h2><p className="mt-2 text-sm text-neutral-600">Only the latest completed day is eligible for the public profile. These choices do not publish historical points. “Verified only” reveals no number.</p>
      <div className="mt-5 space-y-4">{metrics.map((metric) => <label key={metric.id} className="flex items-center justify-between gap-4 border-t pt-4 text-sm">
        <span>{metric.label}<span className="block text-xs text-neutral-500">Private latest day: {status.latest?.find((item) => item.metric_type === metric.id)?.metric_value.toLocaleString() ?? "—"}</span></span><select value={visible(metric.id)} disabled={busy} onChange={(event) => run(async () => {
          await request("set_visibility", { metric_type: metric.id, visibility: event.target.value }); await refresh();
          setNotice("Public visibility updated. Review the public app profile to see exactly what others can see.");
        })} className="rounded-lg border px-2 py-1">{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select>
      </label>)}</div>
      <Link to={`/apps/${id}`} className="mt-5 inline-block text-sm text-sky-700">Preview public app profile →</Link>
    </section>}
  </main>;
}
