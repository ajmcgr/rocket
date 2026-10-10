import { useEffect, useState } from "react";
import { ExternalLink, Github, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type BuildInfo = {
  connected: boolean;
  repository?: string;
  repository_url?: string;
  run?: {
    name: string;
    status: string;
    conclusion: string | null;
    branch: string;
    sha: string | null;
    updated_at: string;
    url: string;
  } | null;
};

function runLabel(run: NonNullable<BuildInfo["run"]>) {
  if (run.status !== "completed") return "In progress";
  if (run.conclusion === "success") return "Passed";
  if (run.conclusion === "failure" || run.conclusion === "timed_out")
    return "Failed";
  if (run.conclusion === "cancelled") return "Cancelled";
  return "Completed";
}

export default function GitHubBuildInfo({
  appId,
  refresh,
  onAddSource,
}: {
  appId: string;
  refresh: number;
  onAddSource: () => void;
}) {
  const [data, setData] = useState<BuildInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setLoading(true);
    supabase.functions
      .invoke("rocket-apps", {
        body: { action: "github_build_info", app_id: appId },
      })
      .then(async ({ data: result, error: failure }) => {
        if (failure || result?.error) {
          let message = result?.error;
          if (!message && failure?.context instanceof Response) {
            try {
              message = (await failure.context.json()).error;
            } catch {
              /* fallback below */
            }
          }
          throw new Error(
            message || "GitHub build information is unavailable right now.",
          );
        }
        if (!result || typeof result.connected !== "boolean")
          throw new Error("GitHub build information is unavailable right now.");
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appId, refresh, retry]);

  return (
    <section
      className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5"
      aria-label="GitHub build information"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Github size={20} aria-hidden="true" /> GitHub builds
        </h3>
        {data?.connected && (
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium disabled:opacity-60"
          >
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Latest public GitHub Actions workflow run for this app’s linked
        repository.
      </p>
      {loading && (
        <p role="status" className="mt-4 text-sm text-neutral-500">
          Loading GitHub builds…
        </p>
      )}
      {!loading && error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="underline"
          >
            Try again
          </button>
        </p>
      )}
      {!loading && !error && data && !data.connected && (
        <div className="mt-4">
          <p className="text-sm text-neutral-600">
            No public GitHub repository is linked to this app.
          </p>
          <button
            type="button"
            onClick={onAddSource}
            className="mt-3 min-h-10 text-sm font-semibold text-sky-800 hover:underline"
          >
            Add public GitHub repository →
          </button>
        </div>
      )}
      {!loading && !error && data?.connected && (
        <div className="mt-4 text-sm">
          <a
            href={data.repository_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-sky-800 hover:underline"
          >
            {data.repository} <ExternalLink size={14} aria-hidden="true" />
          </a>
          {!data.run ? (
            <p className="mt-3 text-neutral-600">
              No GitHub Actions runs are available for this repository yet.
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{data.run.name}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${runLabel(data.run) === "Passed" ? "bg-green-100 text-green-800" : runLabel(data.run) === "Failed" ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-700"}`}
                >
                  {runLabel(data.run)}
                </span>
              </div>
              <p className="mt-2 text-neutral-600">
                {data.run.branch || "Unknown branch"}
                {data.run.sha ? ` · ${data.run.sha.slice(0, 7)}` : ""}
                {data.run.updated_at &&
                !Number.isNaN(Date.parse(data.run.updated_at))
                  ? ` · ${new Date(data.run.updated_at).toLocaleString()}`
                  : ""}
              </p>
              <a
                href={data.run.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 font-medium text-sky-800 hover:underline"
              >
                View workflow run <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
