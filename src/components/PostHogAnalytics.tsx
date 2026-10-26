import { trackVerificationResult } from "@/lib/verificationAnalytics";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { AnalyticsVisibilityControl } from "./AnalyticsVisibilityControl";

type Connection = { status: string; project_id: string | null; project_name: string | null;
  verified_hostname: string | null; last_error: string | null; last_successful_sync: string | null };
type Status = { connection: Connection | null; selected: boolean; active_provider: string | null;
  visibility: string; latest: { metric_date: string; metric_value: number } | null };
type Project = { id: string; name: string };

export function PostHogAnalytics({ appId }: { appId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [region, setRegion] = useState<"us" | "eu">("us");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke("rocket-posthog", {
      body: { action, app_id: appId, ...extra },
    });
    if (invokeError || data?.error) throw new Error(data?.error
      || await edgeFunctionErrorMessage(invokeError, "PostHog request failed"));
    trackVerificationResult("analytics", "posthog", action, data, appId);
    return data;
  }, [appId]);
  const refresh = useCallback(async () => setStatus(await request("status") as Status), [request]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("posthog");
    if (result === "error") setError("PostHog authorization was not completed.");
    if (result === "connected") setNotice("PostHog authorized. Select the project for this app.");
    void refresh().catch((cause) => setError((cause as Error).message));
    const changed = () => { void refresh().catch((cause) => setError((cause as Error).message)); };
    window.addEventListener("rocket-provider-selection-updated", changed);
    return () => window.removeEventListener("rocket-provider-selection-updated", changed);
  }, [refresh]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const connected = status?.connection && status.connection.status !== "disconnected";
  const fresh = Boolean(status?.connection?.last_successful_sync
    && Date.now() - Date.parse(status.connection.last_successful_sync) < 72 * 60 * 60 * 1000);
  return <section className="mt-6 rounded-2xl border bg-white p-6 text-sm">
    <h2 className="font-semibold">PostHog</h2>
    <p className="mt-2 text-neutral-600">You can use one analytics provider at a time. Rocket counts pageviews on this app&apos;s verified website host. Connecting PostHog does not replace Google Analytics until you confirm a verified switch.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-green-800">{notice}</p>}
    {!status && !error && <p className="mt-3 text-neutral-500">Checking connection…</p>}
    {status && <>
      <p className="mt-3 text-neutral-600">{connected
        ? status.connection!.status.replaceAll("_", " ") + " · " + (status.connection!.project_name || "Choose a project")
        : "Not connected"}</p>
      {status.connection?.verified_hostname && <p className="mt-1 text-neutral-500">Verified host: {status.connection.verified_hostname}</p>}
      {status.connection?.last_successful_sync && <p className="mt-1 text-neutral-500">Last successful sync: {new Date(status.connection.last_successful_sync).toLocaleString()}{fresh ? "" : " · stale; sync again before sharing"}</p>}
      {status.connection?.last_error && <p className="mt-2 text-amber-700">{status.connection.last_error}</p>}
      {status.latest && <p className="mt-2 text-neutral-700">Private completed-day pageviews: {status.latest.metric_value.toLocaleString()} on {status.latest.metric_date} UTC</p>}
      {!connected && <div className="mt-4 flex flex-wrap items-end gap-3">
        <label>PostHog region
          <select value={region} onChange={(event) => setRegion(event.target.value as "us" | "eu")}
            className="mt-1 block rounded-lg border p-2">
            <option value="us">US Cloud</option><option value="eu">EU Cloud</option>
          </select>
        </label>
        <button disabled={busy} onClick={() => void run(async () => {
          const result = await request("start", { region }); window.location.assign(result.authorization_url);
        })} className="rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">Connect PostHog</button>
      </div>}
      {connected && !status.connection?.project_id && <div className="mt-4">
        <button disabled={busy} onClick={() => void run(async () => {
          const result = await request("projects"); setProjects(result.projects || []);
        })} className="rounded-xl border px-4 py-2 disabled:opacity-50">Choose PostHog project</button>
        {projects.length > 0 && <div className="mt-3 flex flex-wrap items-end gap-3">
          <label>Project
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}
              className="mt-1 block rounded-lg border p-2">
              <option value="">Select a project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !projectId} onClick={() => void run(async () => {
            const result = await request("select_project", { project_id: projectId });
            await refresh();
            setNotice(result.sync.complete
              ? "Completed-day pageviews verified. PostHog remains private until you switch sources."
              : "Project host matched recent events. Wait for a complete UTC day with pageviews before switching.");
          })} className="rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">
            Verify project and sync</button>
        </div>}
      </div>}
      {connected && status.connection?.project_id && <button disabled={busy}
        onClick={() => void run(async () => {
          const result = await request("retry_sync"); await refresh();
          setNotice(result.sync.complete ? "Completed-day pageviews synced." : "Waiting for a complete UTC day with pageviews.");
        })} className="mt-4 rounded-xl border px-4 py-2 disabled:opacity-50">Sync now</button>}
      {connected && status.connection?.status === "active" && !status.selected && <button
        disabled={busy} onClick={() => {
          if (!window.confirm("Switch this app's active analytics source from "
            + (status.active_provider || "none") + " to PostHog? The new source starts private.")) return;
          void run(async () => {
            await request("activate", { expected_previous: status.active_provider, confirm_switch: true });
            await refresh();
            window.dispatchEvent(new Event("rocket-provider-selection-updated"));
            setNotice("PostHog selected. Its metrics remain private until you choose visibility.");
          });
        }} className="ml-2 mt-4 rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">
        Use verified PostHog</button>}
      {connected && status.selected && status.connection?.status === "active" && <div className="mt-5 border-t pt-4">
        <p className="mb-4 text-neutral-600">Controls what appears on your public app page. Your metrics stay private by default. Only pageviews for the latest completed UTC day can be shown—not monthly visitors or your history.</p>
        <AnalyticsVisibilityControl value={status.visibility} disabled={busy} publicDisabled={!fresh}
          onChange={(visibility) => void run(async () => {
            await request("set_visibility", { visibility }); await refresh();
            setNotice("PostHog visibility updated.");
          })} />
        <Link to={"/apps/" + appId} className="mt-3 inline-block text-sky-700">Preview public app profile →</Link>
      </div>}
      {connected && <button disabled={busy} onClick={() => {
        if (!window.confirm("Disconnect PostHog? Rocket will stop syncing and remove its public traffic verification.")) return;
        void run(async () => {
          await request("disconnect"); setProjects([]); setProjectId("");
          await refresh();
          window.dispatchEvent(new Event("rocket-provider-selection-updated"));
          setNotice("PostHog disconnected.");
        });
      }} className="mt-4 block rounded-xl border px-4 py-2 text-red-700 disabled:opacity-50">
        Disconnect PostHog</button>}
    </>}
  </section>;
}
