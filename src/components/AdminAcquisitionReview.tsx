import { useCallback, useEffect, useState } from "react";
import { acquisitionDb as db } from "@/lib/rocketAcquisition";

type Listing = { app_id: string; app_name: string; status: string; asking_price_cents: number | null; description: string; reason_for_selling: string; preferred_buyer: string };
type Report = { id: string; reason: string; created_at: string; sender_id: string; reporter_id: string };
export default function AdminAcquisitionReview() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const refresh = useCallback(async () => {
    const [listingResult, reportResult, metricResult] = await Promise.all([
      db.rpc("rocket_admin_acquisition_queue"), db.rpc("rocket_admin_message_reports"), db.rpc("rocket_admin_acquisition_metrics"),
    ]);
    if (listingResult.error || reportResult.error || metricResult.error) { setError("Review queues could not be loaded."); return; }
    setListings(listingResult.data || []); setReports(reportResult.data || []);
    setMetrics(metricResult.data || {});
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const reviewListing = async (appId: string, approve: boolean) => {
    const reason = prompt(approve ? "Reason for approving this listing (audit log):" : "Reason for rejecting this listing (audit log):");
    if (!reason || reason.trim().length < 5) return;
    setBusy(appId); setError("");
    const { error: reviewError } = await db.rpc("rocket_admin_review_acquisition", { p_app_id: appId, p_approve: approve, p_reason: reason.trim() });
    if (reviewError) setError(reviewError.message);
    await refresh(); setBusy("");
  };
  const reviewReport = async (id: string) => {
    const reason = prompt("Resolution and reason for the audit log:");
    if (!reason || reason.trim().length < 5) return;
    setBusy(id); setError("");
    const { error: reviewError } = await db.rpc("rocket_admin_review_message_report", { p_report_id: id, p_reason: reason.trim() });
    if (reviewError) setError(reviewError.message);
    await refresh(); setBusy("");
  };
  return <section className="rocket-admin-panel">
    <h2>Acquisition and inbox activity</h2>
    <div className="rocket-admin-stats">{Object.entries(metrics).map(([name, value]) => <div className="rocket-admin-stat" key={name}><div className="rocket-admin-stat-header"><span>{name.replaceAll("_", " ")}</span><img src="/rocket-email-logo.png" alt="" aria-hidden="true" /></div><div className="rocket-admin-stat-figure"><span aria-hidden="true">📊</span><strong>{value.toLocaleString()}</strong></div></div>)}</div>
    <h2>Acquisition listings awaiting review</h2>
    <p className="rocket-admin-muted">Review eligibility and seller-provided information before publication. Domain control alone does not prove legal ownership.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!listings.length && <p className="rocket-admin-muted">No listings awaiting review.</p>}
    {listings.map((row) => <div key={row.app_id} className="my-4 rounded-xl border p-4">
      <h3 className="font-semibold">{row.app_name} · {row.status}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{row.description}</p>
      {row.asking_price_cents != null && <p className="text-sm">Asking price: ${(row.asking_price_cents / 100).toLocaleString()}</p>}
      {row.reason_for_selling && <p className="text-sm">Reason: {row.reason_for_selling}</p>}
      {row.preferred_buyer && <p className="text-sm">Preferred buyer: {row.preferred_buyer}</p>}
      <div className="mt-3 flex gap-2"><button type="button" disabled={!!busy} onClick={() => void reviewListing(row.app_id, true)}>Approve</button><button type="button" disabled={!!busy} onClick={() => void reviewListing(row.app_id, false)}>Reject</button></div>
    </div>)}
    <h2>Message reports</h2><p className="rocket-admin-muted">Report reasons and metadata only. Message bodies are not shown.</p>
    {!reports.length && <p className="rocket-admin-muted">No open reports.</p>}
    {reports.map((row) => <div key={row.id} className="my-4 rounded-xl border p-4"><p className="text-sm">{new Date(row.created_at).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap text-sm">{row.reason}</p><button type="button" disabled={!!busy} onClick={() => void reviewReport(row.id)} className="mt-2">Mark reviewed</button></div>)}
  </section>;
}
