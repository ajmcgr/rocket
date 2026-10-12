import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Kind = "analytics" | "revenue";
type Provider = "ga4" | "posthog" | "stripe" | "revenuecat" | "polar" | "dodo";
type Status = {
  analytics_provider: string | null;
  revenue_provider: string | null;
  connected: Record<Provider, boolean>;
};

const label: Record<Provider, string> = {
  ga4: "Google Analytics",
  posthog: "PostHog",
  stripe: "Stripe",
  revenuecat: "RevenueCat",
  polar: "Polar",
  dodo: "Dodo Payments",
};
const choices: Record<Kind, Provider[]> = {
  analytics: ["ga4", "posthog"],
  revenue: ["stripe", "revenuecat", "polar", "dodo"],
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
    const refresh = () => { void request("status").then(setStatus).catch((cause) => setError((cause as Error).message)); };
    window.addEventListener("rocket-provider-selection-updated", refresh);
    return () => window.removeEventListener("rocket-provider-selection-updated", refresh);
  }, [request]);
  const selected = kind === "analytics" ? status?.analytics_provider : status?.revenue_provider;
  const choose = async (next: Provider | null) => {
    const previous = selected ?? null;
    if (next === previous) return;
    if (!window.confirm(next
      ? `Use ${label[next]} as this app's only active ${kind} source? Other connected sources remain private.`
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
    <p className="mt-2 text-neutral-600">Choose one verified source. Connecting another provider does not add another public metric.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-green-800">{notice}</p>}
    <label className="mt-4 block">Selected {kind} provider
      <select aria-label={`Selected ${kind} provider`} value={selected || ""}
        disabled={!status || busy} onFocus={() => { void request("status").then(setStatus).catch(() => {}); }}
        onChange={(event) => void choose(event.target.value ? event.target.value as Provider : null)}
        className="mt-2 block w-full rounded-lg border p-2 disabled:opacity-50">
        <option value="">None selected</option>
        {choices[kind].map((provider) => <option key={provider} value={provider}
          disabled={provider !== selected && !status?.connected?.[provider]}>
          {label[provider]}{provider !== selected && !status?.connected?.[provider] ? " · connect and verify first" : ""}
        </option>)}
      </select>
    </label>
  </section>;
}
