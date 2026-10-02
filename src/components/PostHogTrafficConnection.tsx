import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Metric = "active_users" | "sessions" | "views";
type Status = {
  connection: null | {
    status: string;
    property_name: string | null;
    verified_hostname: string | null;
    last_successful_sync: string | null;
    last_error: string | null;
  };
  visibility: Array<{ metric_type: Metric; visibility: string }>;
  latest: Array<{
    metric_type: Metric;
    metric_value: number;
    metric_date: string;
  }>;
};
const metrics = [
  { id: "active_users", label: "Unique visitors" },
  { id: "sessions", label: "Sessions" },
  { id: "views", label: "Pageviews" },
] as const;
export default function PostHogTrafficConnection({ appId }: { appId: string }) {
  const [status, setStatus] = useState<Status | null>(null),
    [region, setRegion] = useState("us"),
    [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const request = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const r = await supabase.functions.invoke("rocket-posthog", {
        body: { action, app_id: appId, ...extra },
      });
      if (r.error || r.data?.error)
        throw new Error(
          r.data?.error || r.error?.message || "PostHog request failed",
        );
      return r.data;
    },
    [appId],
  );
  const refresh = useCallback(
    async () => setStatus(await request("status")),
    [request],
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("posthog") === "error")
      setError(
        "PostHog authorization was declined or could not be completed. Try connecting again.",
      );
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const connected =
    status?.connection && status.connection.status !== "disconnected";
  return (
    <section
      className="mt-6 rounded-2xl border bg-white p-6"
      aria-labelledby="posthog-traffic-heading"
    >
      <h2 id="posthog-traffic-heading" className="font-semibold">
        PostHog
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Show traffic for this app’s verified domain. Rocket creates one
        aggregate traffic endpoint in your chosen project and reads daily totals
        only. No visitor details or recordings are imported. PostHog’s endpoint
        usage limits and charges may apply.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {notice}
        </p>
      )}
      {!status && !error && (
        <div
          role="status"
          aria-label="Loading PostHog connection"
          className="mt-4 animate-pulse space-y-2"
        >
          <div className="h-4 w-48 rounded bg-neutral-100" />
          <div className="h-4 w-64 rounded bg-neutral-100" />
        </div>
      )}
      {status && (
        <>
          <p className="mt-3 text-sm">
            {connected
              ? `${status.connection!.status.replaceAll("_", " ")} · ${status.connection!.property_name || "Project not selected"}`
              : "Not connected"}
          </p>
          {!connected && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm">
                PostHog region{" "}
                <select
                  aria-label="PostHog region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="ml-2 rounded-lg border p-2"
                >
                  <option value="us">US Cloud</option>
                  <option value="eu">EU Cloud</option>
                </select>
              </label>
              <button
                disabled={busy}
                className="rounded-xl border border-sky-600 px-4 py-2 text-sm text-sky-700 disabled:opacity-50"
                onClick={() =>
                  run(async () => {
                    const r = await request("start", { region });
                    window.location.assign(r.authorization_url);
                  })
                }
              >
                Connect PostHog
              </button>
            </div>
          )}
          {connected && (
            <>
              {status.connection!.verified_hostname && (
                <p className="mt-1 text-xs text-neutral-500">
                  Verified domain: {status.connection!.verified_hostname}
                </p>
              )}
              {status.connection!.last_successful_sync && (
                <p className="mt-1 text-xs text-neutral-500">
                  Last sync:{" "}
                  {new Date(
                    status.connection!.last_successful_sync,
                  ).toLocaleString()}
                </p>
              )}
              {status.connection!.last_error && (
                <p className="mt-2 text-sm text-amber-700">
                  {status.connection!.last_error}
                </p>
              )}
              {status.connection!.status === "select_property" && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm">
                    Project ID{" "}
                    <input
                      className="mt-1 block w-full rounded-lg border p-2"
                      inputMode="numeric"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder="From your PostHog project URL or settings"
                    />
                  </label>
                  <button
                    disabled={busy || !/^\d{1,12}$/.test(projectId)}
                    className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    onClick={() =>
                      run(async () => {
                        await request("select_project", {
                          project_id: projectId,
                        });
                        await refresh();
                        setNotice(
                          "Domain traffic synced. PostHog metrics remain private until you choose to publish them.",
                        );
                      })
                    }
                  >
                    Create traffic endpoint and verify
                  </button>
                </div>
              )}
              {["active", "error"].includes(status.connection!.status) && (
                <button
                  disabled={busy}
                  className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      await request("retry_sync");
                      await refresh();
                      setNotice("PostHog traffic synced.");
                    })
                  }
                >
                  Sync now
                </button>
              )}
              <button
                disabled={busy}
                className="ml-2 mt-4 rounded-xl border px-4 py-2 text-sm text-red-700 disabled:opacity-50"
                onClick={() => {
                  if (
                    window.confirm(
                      "Disconnect PostHog and remove its public traffic? Private historical totals and the endpoint in PostHog are retained.",
                    )
                  )
                    run(async () => {
                      await request("disconnect");
                      await refresh();
                      setNotice(
                        "Disconnected. PostHog traffic is no longer public.",
                      );
                    });
                }}
              >
                Disconnect
              </button>
            </>
          )}
          {status.connection?.status === "active" && (
            <div className="mt-6 border-t pt-4">
              <h3 className="font-semibold">PostHog public visibility</h3>
              <p className="mt-2 text-xs text-neutral-500">
                Latest complete UTC day only. Unique visitors are distinct
                PostHog visitor IDs, not GA4 active users. Sessions require a
                captured session ID. These choices are independent of Google
                Analytics.
              </p>
              {metrics.map((metric) => (
                <label
                  key={metric.id}
                  className="mt-4 flex items-center justify-between gap-3 text-sm"
                >
                  <span>
                    {metric.label}
                    <span className="block text-xs text-neutral-500">
                      Private latest day:{" "}
                      {status.latest
                        .find((p) => p.metric_type === metric.id)
                        ?.metric_value.toLocaleString() ?? "—"}
                    </span>
                  </span>
                  <select
                    aria-label={`${metric.label} PostHog visibility`}
                    value={
                      status.visibility.find((v) => v.metric_type === metric.id)
                        ?.visibility || "private"
                    }
                    disabled={busy}
                    className="rounded-lg border p-2"
                    onChange={(e) =>
                      run(async () => {
                        await request("set_visibility", {
                          metric_type: metric.id,
                          visibility: e.target.value,
                        });
                        await refresh();
                        setNotice("PostHog public visibility updated.");
                      })
                    }
                  >
                    <option value="private">Private</option>
                    <option value="verified_only">Verified only</option>
                    <option value="range">Range</option>
                    <option value="exact">Exact</option>
                  </select>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
