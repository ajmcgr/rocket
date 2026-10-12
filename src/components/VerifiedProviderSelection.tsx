import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Kind = "analytics" | "revenue";
type Provider = "ga4" | "stripe";
type Status = {
  analytics_provider: string | null;
  revenue_provider: string | null;
  connected: Record<Provider, boolean>;
};

const label: Record<Provider, string> = {
  ga4: "Google Analytics",
  stripe: "Stripe",
};

export function VerifiedProviderSelection({ appId, kind }: { appId: string; kind: Kind }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(async (action: "status" | "select", extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke("rocket-app-provider-selection", {
      body: { action, app_id: appId, ...extra },
    });
    if (invokeError || data?.error) throw new Error(data?.error || await edgeFunctionErrorMessage(invokeError, "Provider choice unavailable"));
    return data as Status;
  }, [appId]);
  useEffect(() => {
    void request("status").then(setStatus).catch((cause) => setError((cause as Error).message));
  }, [request]);
  const selected = kind === "analytics" ? status?.analytics_provider : status?.revenue_provider;
  const provider: Provider = kind === "analytics" ? "ga4" : "stripe";
  const choose = async (next: Provider | null) => {
    const previous = selected ?? null;
    if (next === previous) return;
    if (!window.confirm(next
      ? `Use ${label[next]} as this app's active ${kind} source? The previous source remains connected, but its metrics will no longer appear publicly.`
      : `Clear this app's active ${kind} source? Existing connections and private history remain.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setStatus(await request("select", {
        kind, provider: next, expected_previous: previous, confirm_switch: true,
      }));
      setNotice(next ? `${label[next]} is now the selected ${kind} source.` : `No ${kind} source is selected.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="mt-6 rounded-2xl border bg-white p-6 text-sm">
    <h2 className="font-semibold">Active {kind} source</h2>
    <p className="mt-2 text-neutral-600">{status ? selected || "None selected" : "Checking provider choice…"}</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-green-800">{notice}</p>}
    {status?.connected?.[provider] && selected !== provider && <button disabled={busy}
      onClick={() => void choose(provider)} className="mt-4 rounded-xl border px-4 py-2 disabled:opacity-50">
      Use verified {label[provider]}
    </button>}
    {selected && <button disabled={busy} onClick={() => void choose(null)}
      className="mt-4 rounded-xl border px-4 py-2 disabled:opacity-50">Clear selection</button>}
  </section>;
}
