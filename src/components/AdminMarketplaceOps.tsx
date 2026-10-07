import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { marketplaceRpc } from "@/lib/marketplace";
export default function AdminMarketplaceOps() {
  const [reports, setReports] = useState<
      { id: string; app_id: string; reason: string }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(id: string | null = null) {
    setBusy(true);
    setError("");
    const r = await marketplaceRpc("moderate_app_reports", { p_resolve: id });
    if (r.error) setError(r.error.message);
    else setReports(r.data || []);
    setBusy(false);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="rocket-admin-panel">
      <h2>App reports</h2>
      <p className="rocket-admin-muted">
        Reports require review. Resolution does not automatically hide a
        listing; use the existing app moderation controls when appropriate.
      </p>
      {error && <p role="alert">{error}</p>}
      {reports.map((r) => (
        <article className="mt-3 border-t pt-3" key={r.id}>
          <Link to={`/apps/${r.app_id}`} className="underline">
            View reported app
          </Link>
          <p>{r.reason}</p>
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Mark this report reviewed and resolved?"))
                void load(r.id);
            }}
          >
            Resolve report
          </button>
        </article>
      ))}
      {!error && !reports.length && <p>No open app reports.</p>}
    </section>
  );
}
export function PickCollection({ appId }: { appId: string }) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function assign(value: string) {
    setBusy(true);
    const r = await marketplaceRpc("set_rocket_pick_collection", {
      p_app_id: appId,
      p_collection: value || null,
    });
    setNotice(r.error ? r.error.message : "Collection assignment saved.");
    setBusy(false);
  }
  return (
    <div>
      <label>
        Assign editorial collection
        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => void assign(e.target.value)}
          className="ml-2 min-h-11 border"
        >
          <option value="">Choose / remove collection</option>
          <option value="build">Build software</option>
          <option value="work">Get work done</option>
          <option value="create">Create something</option>
        </select>
      </label>
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
