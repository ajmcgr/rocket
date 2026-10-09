import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Visibility = "private" | "verified_only" | "range" | "exact";
type Status = {
  connect_available: boolean;
  connection: null | { status: string; last_attempted_sync: string | null;
    last_successful_sync: string | null; last_error: string | null };
  source: null | { project_id: string; app_id: string; product_ids: string[]; visibility: Visibility };
  latest: null | { metric_type: string; value_minor: number; currency: string;
    period_start: string; period_end: string; verified_at: string };
};
type Item = { id: string; name: string };
type Preview = { project_id: string; app_id: string; products: Array<Item & { type: string }>;
  metric_type: string; value_minor: number; currency: string;
  period_start: string; period_end: string; notice: string };

const money = (minor: number, currency: string) => new Intl.NumberFormat(undefined,
  { style: "currency", currency }).format(minor / 100);

export function RevenueCatConnection({ appId }: { appId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<Item[]>([]);
  const [apps, setApps] = useState<Item[]>([]);
  const [projectId, setProjectId] = useState("");
  const [app, setApp] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stale = Boolean(status?.connection?.last_successful_sync
    && Date.now() - Date.parse(status.connection.last_successful_sync) >= 72 * 60 * 60 * 1000);
  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: requestError } = await supabase.functions.invoke("rocket-revenuecat", {
      body: { action, app_id: appId, ...extra },
    });
    if (requestError || data?.error) throw new Error(data?.error || await edgeFunctionErrorMessage(requestError, "RevenueCat request failed"));
    return data;
  }, [appId]);
  const refresh = useCallback(async () => setStatus(await request("status") as Status), [request]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("revenuecat");
    if (result === "connected") setNotice("RevenueCat authorized. Choose the project for this app; all revenue stays private.");
    if (result === "error") setError("RevenueCat authorization was not completed.");
    void refresh().catch((cause) => setError((cause as Error).message));
  }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const loadProjects = () => run(async () => {
    const result = await request("projects");
    setProjects(result.projects || []);
  });
  const chooseProject = (id: string) => run(async () => {
    setProjectId(id); setApp(""); setApps([]); setPreview(null); setConfirmed(false);
    if (!id) return;
    const result = await request("project_apps", { project_id: id });
    setApps(result.apps || []);
    if (!result.supported) setError("This project has multiple apps. RevenueCat's project-wide revenue cannot safely verify one Rocket app.");
  });
  return <section className="mt-6 rounded-2xl border bg-white p-6">
    <h2 className="font-semibold">RevenueCat</h2>
    <p className="mt-2 text-sm text-neutral-600">Verify the previous 30 complete UTC days of RevenueCat gross project revenue. RevenueCat includes purchases and ads, and subtracts refunds and adjustments in the period they occur. This is not MRR. For app-specific accuracy, this flow accepts projects with exactly one app and maps the complete product catalogue.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {!status && !error && <p className="mt-4 text-sm text-neutral-500">Checking availability…</p>}
    {status && <>
      <p className="mt-3 text-sm text-neutral-600">{status.connection
        ? `Connection: ${status.connection.status}` : status.connect_available ? "Available to connect" : "Coming soon — OAuth registration or secure server configuration is pending"}</p>
      {status.connection?.last_successful_sync && <p className="mt-1 text-xs text-neutral-500">Last verified: {new Date(status.connection.last_successful_sync).toLocaleString()}</p>}
      {stale && <p className="mt-2 text-sm text-amber-700">This verification is stale. Public revenue is hidden until a successful sync.</p>}
      {status.connection?.last_error && <p className="mt-2 text-sm text-amber-700">Action required: {status.connection.last_error}</p>}
      {status.connect_available && <button disabled={busy} onClick={() => run(async () => {
        const result = await request("start"); window.location.assign(result.authorization_url);
      })} className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">{status.connection ? "Reauthorize RevenueCat" : "Connect RevenueCat"}</button>}
      {status.connection && <button disabled={busy} onClick={loadProjects}
        className="ml-2 mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Choose project</button>}
      {projects.length > 0 && <label className="mt-5 block text-sm">RevenueCat project
        <select value={projectId} disabled={busy} onChange={(event) => void chooseProject(event.target.value)}
          className="mt-2 block w-full rounded-lg border px-3 py-2">
          <option value="">Select project</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {apps.length === 1 && <label className="mt-4 block text-sm">RevenueCat app
        <select value={app} disabled={busy} onChange={(event) => { setApp(event.target.value); setPreview(null); setConfirmed(false); }}
          className="mt-2 block w-full rounded-lg border px-3 py-2">
          <option value="">Select app</option>
          {apps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      {projectId && app && <button disabled={busy} onClick={() => run(async () => {
        const result = await request("preview", { project_id: projectId, revenuecat_app_id: app });
        setPreview(result as Preview); setConfirmed(false);
      })} className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Preview verified source</button>}
      {preview && <div className="mt-5 rounded-xl border bg-neutral-50 p-4 text-sm">
        <p className="font-semibold">RevenueCat gross revenue: {money(preview.value_minor, preview.currency)}</p>
        <p className="mt-1 text-neutral-600">{preview.period_start} to {preview.period_end} · USD converted by RevenueCat</p>
        <p className="mt-2 text-neutral-600">{preview.notice}</p>
        <p className="mt-3 font-medium">All {preview.products.length} mapped products</p>
        <ul className="mt-1 max-h-36 list-disc overflow-y-auto pl-5 text-neutral-600">
          {preview.products.map((item) => <li key={item.id}>{item.name} · {item.id}</li>)}
        </ul>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />
          <span>This project has only contained this app, and its historical revenue belongs to this app. Map the complete product catalogue. Keep revenue private.</span></label>
        <button disabled={busy || !confirmed} onClick={() => run(async () => {
          await request("save_mapping", { project_id: preview.project_id,
            revenuecat_app_id: preview.app_id, confirm_all_products: true });
          await refresh(); setPreview(null); setNotice("RevenueCat revenue verified privately. Public visibility remains off.");
        })} className="mt-4 rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">Save private source</button>
      </div>}
      {status.source && <div className="mt-5 border-t pt-4 text-sm">
        <p className="font-medium">Mapped RevenueCat source</p>
        <p className="mt-1 text-neutral-600">Project {status.source.project_id} · {status.source.product_ids.length} products · {status.source.visibility}</p>
        {status.latest && <p className="mt-2 text-neutral-700">Latest private snapshot: {money(status.latest.value_minor, status.latest.currency)} gross revenue, {status.latest.period_start} to {status.latest.period_end}</p>}
        <button disabled={busy} onClick={() => run(async () => {
          await request("sync"); await refresh(); setNotice("RevenueCat revenue refreshed.");
        })} className="mt-3 rounded-xl border px-4 py-2 disabled:opacity-50">Sync now</button>
        <label className="mt-4 block">Public visibility
          <select value={status.source.visibility} disabled={busy} onChange={(event) => run(async () => {
            await request("set_visibility", { visibility: event.target.value });
            await refresh(); setNotice("Visibility updated. Public display still requires a healthy, fresh provider sync.");
          })} className="mt-2 block rounded-lg border px-3 py-2">
            <option value="private">Private</option><option value="verified_only">Verified only</option>
            <option value="range">Range</option><option value="exact">Exact</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => {
          if (!window.confirm("Disconnect RevenueCat from this app and remove public verification? Provider-side OAuth access can be revoked in RevenueCat Account → Security.")) return;
          void run(async () => { await request("disconnect"); await refresh(); setProjects([]); setApps([]); setPreview(null);
            setNotice("Disconnected locally. Public verification was removed."); });
        }} className="mt-4 rounded-xl border px-4 py-2 text-red-700 disabled:opacity-50">Disconnect RevenueCat</button>
      </div>}
    </>}
  </section>;
}
