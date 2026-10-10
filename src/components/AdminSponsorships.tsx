import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string; type: string; app_id: string; app_name: string; category: string | null;
  buyer: string | null; amount_cents: number; payment_status: string;
  status: string; start: string | null; end: string | null; moderation_hold: boolean;
};
const rpc = supabase.rpc.bind(supabase) as unknown as
  (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export default function AdminSponsorships() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await rpc("rocket_admin_sponsorships");
    if (result.error) { setError(result.error.message); return; }
    setRows(Array.isArray(result.data) ? result.data as Row[] : []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const hold = async (row: Row) => {
    setBusy(true); setError("");
    const result = await rpc("rocket_admin_sponsorship_hold", { p_id: row.id, p_hold: !row.moderation_hold });
    if (result.error) setError(result.error.message);
    else await load();
    setBusy(false);
  };
  return <section className="rocket-admin-panel" aria-labelledby="admin-advertising">
    <h2 id="admin-advertising">Advertising</h2>
    <p className="rocket-admin-muted">Paid placements are separate from editorial picks and rankings. Holds stop display; only verified Stripe payment creates a paid booking.</p>
    {error && <p className="rocket-admin-error" role="alert">{error}</p>}
    {rows.length ? <div className="rocket-admin-list">{rows.map((row) => <article key={row.id}>
      <strong><Link to={`/apps/${row.app_id}`}>{row.app_name || "App"}</Link> · {row.type.replaceAll("_", " ")}{row.category ? ` · ${row.category}` : ""}</strong>
      <p>{row.status} · payment {row.payment_status} · ${(row.amount_cents / 100).toFixed(2)} USD</p>
      <p>Buyer {row.buyer || "—"} · {date(row.start)} – {date(row.end)}</p>
      <p>{row.moderation_hold ? "Display held for moderation" : "No moderation hold"}</p>
      <button disabled={busy || !["active", "scheduled"].includes(row.status)} onClick={() => void hold(row)}>{row.moderation_hold ? "Release hold" : "Hold display"}</button>
    </article>)}</div> : <p className="rocket-admin-muted">No sponsorships yet.</p>}
  </section>;
}
