import { trackVerificationJourney, trackVerificationResult } from "@/lib/verificationAnalytics";
import VerificationProgress from "./VerificationProgress";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Provider = "polar" | "dodo";
type Visibility = "private" | "verified_only" | "range" | "exact";
type Status = {
  connect_available: boolean;
  selected_provider: string | null;
  connection: null | { status: string; last_successful_sync: string | null; last_error: string | null };
  source: null | { account_id: string; product_ids: string[]; visibility: Visibility };
  latest: null | { metric_type: string; value_minor: number; currency: string;
    period_start: string; period_end: string; verified_at: string };
};
type Account = { id: string; name: string };
type Preview = { account_id: string; account_name: string; products: Array<{ id: string; name: string }>;
  metric_type: string; value_minor: number; currency: string; period_start: string; period_end: string };
const money = (minor: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(minor / 100);

export function AlternativeRevenueConnection({ appId, provider }: { appId: string; provider: Provider }) {
  const name = provider === "polar" ? "Polar" : "Dodo Payments";
  const [status, setStatus] = useState<Status | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [credential, setCredential] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dedicated, setDedicated] = useState(false);
  const [switchConfirmed, setSwitchConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const request = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke("rocket-alternative-revenue", {
      body: { action, app_id: appId, provider, ...extra },
    });
    if (invokeError || data?.error) throw new Error(data?.error || await edgeFunctionErrorMessage(invokeError, `${name} request failed`));
    trackVerificationResult("revenue", provider, action, data, appId, extra);
    return data;
  }, [appId, provider, name]);
  const refresh = useCallback(async () => setStatus(await request("status") as Status), [request]);
  useEffect(() => { void refresh().catch(() => setUnavailable(true)); }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const connect = () => run(async () => {
    const key = credential;
    setCredential("");
    trackVerificationJourney("verification_connection_started", { appId, kind: "revenue", provider });
    const result = await request("connect", { credential: key });
    setAccounts(result.accounts || []);
    await refresh();
    setNotice("Read-only connection saved. Select a dedicated account and preview the metric before publishing anything.");
  });
  const loadAccounts = () => run(async () => {
    const result = await request("accounts");
    setAccounts(result.accounts || []);
  });
  const metricLabel = provider === "polar" ? "Gross revenue" : "Succeeded payment volume";
  return <section className="mt-6 rounded-2xl border bg-white p-6 text-sm">
    <h2 className="font-semibold text-neutral-900">{name}</h2>
    <p className="mt-2 text-neutral-600">{provider === "polar"
      ? "Connect a read-only organization token with organizations, products and metrics access. Rocket verifies the previous 30 complete UTC days of Polar revenue."
      : "Connect a live, read-only Dodo API key. Rocket verifies succeeded, non-refunded USD payments from the previous 30 complete UTC days. This is customer payment volume, including tax, not MRR."}</p>
    <p className="mt-2 text-neutral-600">Use a {provider === "polar" ? "Polar organization" : "Dodo brand"} dedicated to this one app. A shared account cannot be attributed safely.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    {!status && !unavailable && <p className="mt-4 text-neutral-500">Checking connection…</p>}
    {unavailable && <p className="mt-4 text-neutral-600">Connection setup is not available yet.</p>}
    {status && <>
      <p className="mt-3 text-neutral-600">{status.connection ? `Connection: ${status.connection.status}`
        : status.connect_available ? "Ready to connect" : "Secure credential storage is not configured"}</p>
      {status.connection?.last_successful_sync && <p className="mt-1 text-xs text-neutral-500">Last verified: {new Date(status.connection.last_successful_sync).toLocaleString()}</p>}
      {status.connection?.last_error && <p className="mt-2 text-amber-700">Action required: {status.connection.last_error}</p>}
      <VerificationProgress appId={appId} kind="revenue" provider={provider} connected={Boolean(status.connection)}
        status={status.connection?.status} lastError={status.connection?.last_error}
        successfulSync={status.connection?.last_successful_sync || status.latest?.verified_at}
        visibility={status.source?.visibility || "private"} visibilityTarget={`${provider}-visibility`} />
      {status.connect_available && <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1">{provider === "polar" ? "Read-only organization token" : "Live Dodo API key (Rocket reads data only)"}
          <input type="password" autoComplete="off" value={credential} disabled={busy}
            onChange={(event) => setCredential(event.target.value)}
            className="mt-2 block w-full rounded-lg border px-3 py-2" />
        </label>
        <button type="button" disabled={busy || !credential} onClick={connect}
          className="rounded-xl border px-4 py-2 disabled:opacity-50">{status.connection ? "Replace key" : `Connect ${name}`}</button>
      </div>}
      {status.connection && <button type="button" disabled={busy} onClick={loadAccounts}
        className="mt-4 rounded-xl border px-4 py-2 disabled:opacity-50">Choose {provider === "polar" ? "organization" : "brand"}</button>}
      {accounts.length > 0 && <label className="mt-4 block">{provider === "polar" ? "Polar organization" : "Dodo brand"}
        <select value={accountId} disabled={busy} onChange={(event) => { setAccountId(event.target.value); setPreview(null); setDedicated(false); }}
          className="mt-2 block w-full rounded-lg border px-3 py-2">
          <option value="">Select account</option>
          {accounts.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
        </select>
      </label>}
      {accountId && <button type="button" disabled={busy} onClick={() => run(async () => {
        setPreview(await request("preview", { account_id: accountId }) as Preview); setDedicated(false);
      })} className="mt-4 rounded-xl border px-4 py-2 disabled:opacity-50">Preview verified source</button>}
      {preview && <div className="mt-5 rounded-xl border bg-neutral-50 p-4">
        <p className="font-semibold">{metricLabel}: {money(preview.value_minor)}</p>
        <p className="mt-1 text-neutral-600">{preview.period_start} to {preview.period_end} · USD</p>
        <p className="mt-2 text-neutral-600">{preview.account_name} · {preview.products.length} products</p>
        <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-neutral-600">
          {preview.products.map((item) => <li key={item.id}>{item.name || item.id}</li>)}
        </ul>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={dedicated}
          onChange={(event) => setDedicated(event.target.checked)} />
          <span>This account and its historical revenue belong only to this Rocket app. Keep the result private by default.</span></label>
        {status.selected_provider && status.selected_provider !== provider && <label className="mt-3 flex items-start gap-2 text-amber-900">
          <input type="checkbox" checked={switchConfirmed} onChange={(event) => setSwitchConfirmed(event.target.checked)} />
          <span>Replace {status.selected_provider} as the app’s one active revenue provider after verification.</span>
        </label>}
        <button type="button" disabled={busy || !dedicated || Boolean(status.selected_provider && status.selected_provider !== provider && !switchConfirmed)}
          onClick={() => run(async () => {
            await request("save_mapping", { account_id: preview.account_id,
              confirm_dedicated: true, confirm_switch: switchConfirmed });
            await refresh(); setPreview(null);
            window.dispatchEvent(new Event("rocket-provider-selection-updated"));
            setNotice(`${name} verified privately. Public visibility remains off.`);
          })} className="mt-4 rounded-xl bg-brand px-4 py-2 text-white disabled:opacity-50">Save private source</button>
      </div>}
      {status.source && <div className="mt-5 border-t pt-4">
        <p className="font-medium">Mapped {name} account · {status.source.product_ids.length} products</p>
        {status.latest && <p className="mt-2 text-neutral-700">Latest private snapshot: {money(status.latest.value_minor)} · {status.latest.period_start} to {status.latest.period_end}</p>}
        <button type="button" disabled={busy} onClick={() => run(async () => {
          await request("sync"); await refresh(); setNotice(`${name} revenue refreshed.`);
        })} className="mt-3 rounded-xl border px-4 py-2 disabled:opacity-50">Sync now</button>
        <p className="mt-3 text-xs text-neutral-600">Private keeps revenue off your listing. Verified only shows a badge without an amount. Range or Exact shows supported verified {metricLabel.toLowerCase()} only when a fresh sync is eligible.</p>
        <label id={`${provider}-visibility`} className="mt-4 block">Public visibility
          <select value={status.source.visibility} disabled={busy} onChange={(event) => run(async () => {
            await request("set_visibility", { visibility: event.target.value });
            await refresh(); setNotice("Visibility updated. Public display still requires a healthy, fresh live sync.");
          })} className="mt-2 block w-full max-w-full rounded-lg border px-3 py-2 sm:w-auto">
            <option value="private">Private</option><option value="verified_only">Verified only</option>
            <option value="range">Range</option><option value="exact">Exact</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => {
          if (!window.confirm(`Disconnect ${name} from this app and remove its public verification? Revoke the key separately in ${name}.`)) return;
          void run(async () => { await request("disconnect"); await refresh(); setAccounts([]); setPreview(null);
            window.dispatchEvent(new Event("rocket-provider-selection-updated"));
            setNotice("Disconnected locally. Public verification was removed."); });
        }} className="mt-4 rounded-xl border px-4 py-2 text-red-700 disabled:opacity-50">Disconnect {name}</button>
      </div>}
    </>}
  </section>;
}
