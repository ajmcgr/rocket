import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MyApp } from "./AppJourney";

type Connections = { ga4: boolean; posthog: boolean; stripe_revenue: boolean; stripe_payments: boolean };
type Action = keyof Connections | "app";
const labels: Record<Action, string> = { ga4: "Google Analytics", posthog: "PostHog", stripe_revenue: "Stripe revenue verification", stripe_payments: "Stripe payments", app: "app" };
const consequences: Record<Action, string> = {
  ga4: "Rocket will stop syncing traffic and remove public traffic verification. Private history stays. Google may revoke the shared grant for other apps using the same Google account.",
  posthog: "Rocket will stop syncing PostHog and remove its public traffic verification. Private history stays. Revoke Rocket’s grant in PostHog as well if you want to remove provider-side access.",
  stripe_revenue: "Rocket will stop verifying this app’s revenue. Private history stays. This does not disconnect Buy with Rocket payments or other apps using the same Stripe account. Uninstall the Stripe App separately if no longer needed.",
  stripe_payments: "This app will stop accepting new Buy with Rocket payments. Your Stripe account will not be deleted. Apps with purchases or open checkouts require support so customers are not disrupted.",
  app: "Remove this app from My Apps and release your ownership claim. Its public listing stays. You will need to verify ownership again to reconnect. Disconnect integrations first; apps with customers or connected Rocket ID users require support.",
};

async function request(appId: string, action: string, endpoint = "rocket-app-disconnect") {
  const { data, error } = await supabase.functions.invoke(endpoint, { body: { app_id: appId, action } });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context instanceof Response) {
      try { message = (await error.context.json()).error; } catch { /* retain fallback */ }
    }
    throw new Error(message || "Could not update this connection. Please retry.");
  }
  return data;
}

export default function AppDisconnectControls({ item, onDisconnected }: { item: MyApp; onDisconnected: () => void }) {
  const [connections, setConnections] = useState<Connections | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = async () => setConnections(await request(item.app_id, "status"));
  useEffect(() => {
    let alive = true;
    request(item.app_id, "status").then((data) => { if (alive) setConnections(data); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [item.app_id]);
  const disconnect = async () => {
    if (!confirm || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(item.app_id, confirm === "ga4" || confirm === "stripe_revenue" ? "disconnect" : confirm,
        confirm === "ga4" ? "rocket-ga4" : confirm === "stripe_revenue" ? "rocket-stripe-revenue" : "rocket-app-disconnect");
      if (confirm === "app") { onDisconnected(); return; }
      setNotice(`${labels[confirm]} disconnected from Rocket.`); setConfirm(null);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Disconnect failed. Please retry."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Manage app connections" className="mt-5 border-t border-neutral-100 pt-4 text-sm">
    <h3 className="font-semibold">Manage connections</h3>
    {!connections && !error && <p role="status" className="mt-2 text-neutral-500">Loading connections…</p>}
    {connections && <div className="mt-3 flex flex-wrap gap-3">
      {(Object.keys(labels) as Action[]).filter((key) => key === "app" || connections[key]).map((key) =>
        <button key={key} disabled={busy} onClick={() => { setConfirm(key); setError(""); setNotice(""); }}
          className="min-h-11 rounded-lg border border-neutral-200 px-3 text-red-700 hover:bg-red-50 disabled:opacity-50">Disconnect {labels[key]}</button>)}
    </div>}
    {confirm && <div role="dialog" aria-modal="false" aria-label={`Disconnect ${labels[confirm]}?`} className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="font-semibold">Disconnect {confirm === "app" ? item.app?.name || "this app" : labels[confirm]}?</p>
      <p className="mt-2 text-neutral-700">{consequences[confirm]}</p>
      <div className="mt-4 flex gap-3">
        <button disabled={busy} onClick={disconnect} className="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-50">{busy ? "Disconnecting…" : "Confirm disconnect"}</button>
        <button disabled={busy} onClick={() => setConfirm(null)} className="min-h-11 rounded-lg border bg-white px-4">Cancel</button>
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 text-red-700">{error} {!connections && <button onClick={() => { setError(""); refresh().catch((err) => setError(err.message)); }} className="underline">Retry</button>}</p>}
    {notice && <p role="status" className="mt-3 text-green-700">{notice}</p>}
    {connections && !connections.posthog && <p className="mt-2 text-xs text-neutral-500">PostHog is not connected to this app.</p>}
  </section>;
}
