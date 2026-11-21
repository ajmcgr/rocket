import { useCallback, useEffect, useState } from "react";
import { dealsDb as db, money, type DealFinancial } from "@/lib/rocketDeals";

export type CurrencyTotals = {
  currency: string; completed_acquisitions: number; cancelled_transactions: number;
  completed_volume_minor: number; gross_earned_minor: number; fees_collected_minor: number;
  fees_refunded_minor: number; fees_outstanding_minor: number; average_transaction_minor: number;
};
type AdminTransaction = DealFinancial & { environment?: string | null; provider_status?: string | null;
  attempt_status?: string | null; last_synced_at?: string | null; last_error?: string | null;
  buyer_id?: string; seller_id?: string; app_name?: string };
export type DealReport = { currencies: CurrencyTotals[]; transactions: AdminTransaction[] };
const actionLabels: Record<string,string> = {
  escrow_initiated: "Record external escrow setup", funds_secured: "Record externally verified funding",
  transfer_in_progress: "Record transfer in progress", buyer_inspection: "Record buyer inspection",
  completed: "Record externally verified completion", cancelled: "Record cancellation",
  disputed: "Record dispute", refunded: "Record external refund",
  fee_collected: "Record verified Rocket fee collection", fee_waived: "Waive Rocket fee",
  fee_refunded: "Record Rocket fee refund",
};
function actions(row: AdminTransaction): string[] {
  if (row.escrow_provider === "escrow.com" || row.attempt_status) return [];
  switch (row.transaction_status) {
    case "offer_accepted": return ["cancelled"];
    case "awaiting_escrow": return ["escrow_initiated","cancelled"];
    case "escrow_initiated": return ["funds_secured","cancelled"];
    case "funds_secured": return ["transfer_in_progress","disputed"];
    case "transfer_in_progress": return ["buyer_inspection","disputed"];
    case "buyer_inspection": return ["completed","disputed"];
    case "completed": return [...(row.fee_status === "pending_collection" ? ["fee_collected","fee_waived"] : []),"disputed","refunded"];
    case "cancelled": case "disputed": return ["refunded"];
    case "refunded": return row.fee_collected_minor > 0 && row.fee_refunded_minor === 0 ? ["fee_refunded"] : [];
    default: return [];
  }
}
export default function AdminDealFees({ onReport }: { onReport?: (report: DealReport) => void }) {
  const [report,setReport] = useState<DealReport | null>(null);
  const [error,setError] = useState("");
  const [feedback,setFeedback] = useState("");
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState<{dealId:string;action:string} | null>(null);
  const [evidence,setEvidence] = useState("");
  const [provider,setProvider] = useState("");
  const [externalId,setExternalId] = useState("");
  const [providerFee,setProviderFee] = useState("");
  const [processingFee,setProcessingFee] = useState("");
  const refresh = useCallback(async () => {
    const {data,error:issue} = await db.rpc("rocket_admin_deal_financial_report");
    if (issue) { setError(issue.message); return; }
    const nextReport = data as DealReport;
    setReport(nextReport); onReport?.(nextReport); setError("");
  },[onReport]);
  useEffect(() => { void refresh(); },[refresh]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || evidence.trim().length < 20) return;
    const row = report?.transactions.find((item) => item.deal_id === selected.dealId);
    if (!row) return;
    const feeValue = (value: string) => value.trim() === "" ? null : Number(value);
    setBusy(true); setError(""); setFeedback("");
    const {error:issue} = await db.rpc("rocket_admin_record_deal_finance",{
      p_deal_id:selected.dealId,p_action:selected.action,p_request_id:crypto.randomUUID(),
      p_evidence:evidence.trim(),p_provider:provider.trim() || null,p_external_id:externalId.trim() || null,
      p_provider_fee_minor:feeValue(providerFee),p_processing_fee_minor:feeValue(processingFee),
    });
    setBusy(false);
    if (issue) { setError(issue.message); return; }
    setFeedback(`${actionLabels[selected.action]} recorded with an admin audit entry.`);
    setSelected(null); setEvidence(""); setProvider(""); setExternalId(""); setProviderFee(""); setProcessingFee("");
    await refresh();
  }
  return <section className="rocket-admin-panel">
    <h2>Acquisition closing fees</h2>
    <p className="rocket-admin-muted">3% Rocket closing fee, split equally. The $99 combined minimum applies to USD only. Figures are grouped by currency; outstanding fees are not collected revenue. Escrow.com transaction figures reflect the last provider verification.</p>
    {error && <p role="alert" className="rocket-admin-error">{error}</p>}
    {feedback && <p role="status" className="rocket-admin-note">{feedback}</p>}
    {!report && !error && <p className="rocket-admin-muted">Loading acquisition finance…</p>}
    {report?.currencies.length === 0 && <p className="rocket-admin-muted">No accepted acquisition deals yet.</p>}
    {report?.currencies.map((row) => <div key={row.currency} className="my-4 rounded-xl border p-4">
      <h3 className="font-semibold">{row.currency}</h3>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p>Completed volume: <strong>{money(row.completed_volume_minor,row.currency)}</strong></p>
        <p>Gross Rocket fees earned: <strong>{money(row.gross_earned_minor,row.currency)}</strong></p>
        <p>Fees collected: <strong>{money(row.fees_collected_minor,row.currency)}</strong></p>
        <p>Fees outstanding: <strong>{money(row.fees_outstanding_minor,row.currency)}</strong></p>
        <p>Fees refunded: <strong>{money(row.fees_refunded_minor,row.currency)}</strong></p>
        <p>Average transaction: <strong>{money(row.average_transaction_minor,row.currency)}</strong></p>
        <p>Completed acquisitions: <strong>{row.completed_acquisitions}</strong></p>
        <p>Cancelled transactions: <strong>{row.cancelled_transactions}</strong></p>
      </div>
    </div>)}
    {!!report?.transactions.length && <><h3 className="mt-6 font-semibold">Transactions</h3><div className="rocket-admin-list">
      {report.transactions.map((row) => <article key={row.deal_id}>
        <strong><a href={`/deals/${row.deal_id}`}>{row.app_name || "Deal"} · {row.deal_id.slice(0,8)} ↗</a> · {money(row.acquisition_price_minor,row.currency)}</strong>
        {row.buyer_id && row.seller_id && <p>Buyer {row.buyer_id.slice(0,8)} · Seller {row.seller_id.slice(0,8)}</p>}
        <p>Rocket fee {money(row.total_rocket_fee_minor,row.currency)} · buyer {money(row.buyer_fee_minor,row.currency)} · seller {money(row.seller_fee_minor,row.currency)}</p>
        <p>Transaction {row.transaction_status.replaceAll("_"," ")} · fee {row.fee_status.replaceAll("_"," ")} · collected {money(row.fee_collected_minor,row.currency)} · refunded {money(row.fee_refunded_minor,row.currency)}</p>
        {row.external_escrow_id && <p>External reference: {row.escrow_provider} · {row.external_escrow_id}</p>}
        {row.provider_status && <p>Provider status: {row.provider_status.replaceAll("_"," ")} · {row.environment} · last sync {row.last_synced_at ? new Date(row.last_synced_at).toLocaleString() : "never"}</p>}
        {row.last_error && <p className="text-amber-800">Reconciliation: {row.last_error}</p>}
        {row.provider_fee_minor != null && <p>External provider fee: {money(row.provider_fee_minor,row.currency)}</p>}
        {row.escrow_provider === "escrow.com" && row.external_escrow_id && <button disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          const result = await db.functions.invoke("rocket-escrow",{body:{action:"sync",deal_id:row.deal_id}});
          setBusy(false);
          if (result.error || result.data?.error) setError(result.data?.error || "Provider sync failed");
          else await refresh();
        }} className="mt-2 rounded-lg border px-3 py-2 text-sm">Sync with Escrow.com</button>}
        <div className="rocket-admin-actions">{actions(row).map((action) => <button key={action} disabled={busy} onClick={() => {setSelected({dealId:row.deal_id,action});setEvidence("");setError("");}}>{actionLabels[action]}</button>)}</div>
        {selected?.dealId === row.deal_id && <form onSubmit={(event) => {void submit(event);}} className="mt-3 grid gap-2">
          <strong>{actionLabels[selected.action]}</strong>
          <label>External verification or reconciliation evidence (required, 20–2000 characters)<textarea required minLength={20} maxLength={2000} value={evidence} onChange={(event) => setEvidence(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
          {selected.action === "escrow_initiated" && <><label>External provider<input required minLength={2} maxLength={80} value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
            <label>External transaction reference<input required minLength={3} maxLength={200} value={externalId} onChange={(event) => setExternalId(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label></>}
          {["escrow_initiated","completed"].includes(selected.action) && <div className="grid gap-2 sm:grid-cols-2"><label>External escrow fee ({row.currency} minor units, optional)<input type="number" min="0" step="1" value={providerFee} onChange={(event) => setProviderFee(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>
            <label>External processing fee ({row.currency} minor units, optional)<input type="number" min="0" step="1" value={processingFee} onChange={(event) => setProcessingFee(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label></div>}
          <p className="text-sm">Record this only after checking the external provider or payment evidence. This action does not move funds.</p>
          <div className="rocket-admin-actions"><button type="submit" disabled={busy || evidence.trim().length < 20}>Confirm record</button><button type="button" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div>
        </form>}
      </article>)}
    </div></>}
  </section>;
}
