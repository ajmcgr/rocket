import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { acquisitionDb as db, askingPrice, type AcquisitionListing } from "@/lib/rocketAcquisition";
import { track } from "@/lib/analytics";

export function valuationPriceSuggestion(search: string): string {
  const value = new URLSearchParams(search).get("valuation_price");
  if (!value || !/^\d{1,9}$/.test(value)) return "";
  const amount = Number(value);
  return amount >= 1 ? String(amount) : "";
}

export default function AcquisitionSettings({ appId, suggestedPrice, startForSale = false, title = "Apps for Sale" }: {
  appId: string;
  suggestedPrice?: number | null;
  startForSale?: boolean;
  title?: string;
}) {
  const priceSuggestion = typeof suggestedPrice === "number" && Number.isSafeInteger(suggestedPrice)
    && suggestedPrice >= 1 && suggestedPrice <= 999_999_999
    ? String(suggestedPrice)
    : valuationPriceSuggestion(typeof window === "undefined" ? "" : window.location.search);
  const initialPriceSuggestion = useRef(priceSuggestion);
  const [listing, setListing] = useState<AcquisitionListing | null>(null);
  const [status, setStatus] = useState<AcquisitionListing["status"]>("not_for_sale");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [buyer, setBuyer] = useState("");
  const [enquiries, setEnquiries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      db.from("rocket_acquisition_listings").select("*").eq("app_id", appId).maybeSingle(),
      db.from("rocket_conversations").select("id", { count: "exact", head: true }).eq("app_id", appId),
    ]).then(([listingResult, enquiryResult]: any[]) => {
      if (!active) return;
      if (listingResult.error) { setError("Acquisition settings could not be loaded."); return; }
      const row = listingResult.data as AcquisitionListing | null;
      setListing(row); setStatus(row?.status || (startForSale || initialPriceSuggestion.current ? "for_sale" : "not_for_sale"));
      setPrice(row?.asking_price_cents ? String(row.asking_price_cents / 100) : row ? "" : initialPriceSuggestion.current);
      setDescription(row?.description || ""); setReason(row?.reason_for_selling || ""); setBuyer(row?.preferred_buyer || "");
      if (!enquiryResult.error) setEnquiries(enquiryResult.count || 0);
    });
    return () => { active = false; };
  }, [appId, startForSale]);
  const save = async () => {
    setError(""); setNotice("");
    const amount = price.trim() === "" ? null : Number(price);
    if (status === "for_sale" && amount !== null && (!Number.isFinite(amount) || amount < 1 || !Number.isSafeInteger(Math.round(amount * 100)))) {
      setError("Enter a valid USD asking price of at least $1, or leave it blank."); return;
    }
    setBusy(true);
    const result = await db.rpc("set_rocket_acquisition_listing", {
      p_app_id: appId, p_status: status, p_asking_price_cents: status === "for_sale" && amount !== null ? Math.round(amount * 100) : null,
      p_description: description.trim(), p_reason: reason.trim(), p_preferred_buyer: buyer.trim(),
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    const previousStatus = listing?.status || "not_for_sale";
    setListing({ ...(listing || { app_id: appId, seller_user_id: "", updated_at: new Date().toISOString() }),
      status, review_status: result.data, asking_price_cents: status === "for_sale" && amount !== null ? Math.round(amount * 100) : null,
      description: description.trim(), reason_for_selling: reason.trim(), preferred_buyer: buyer.trim() });
    if (status === "not_for_sale") {
      if (previousStatus !== "not_for_sale") track("acquisition_listing_disabled", { app_id: appId });
    } else if (previousStatus === "not_for_sale") {
      track("acquisition_listing_created", { app_id: appId });
    }
    if (!listing && priceSuggestion && status !== "not_for_sale" && result.data === "approved")
      track("valuation_listing_published", { app_id: appId });
    setNotice(status === "not_for_sale" ? "Listing disabled. Existing conversations remain in Inbox." :
      result.data === "approved" ? `Listing is live. ${askingPrice(status === "for_sale" && amount !== null ? Math.round(amount * 100) : null)}` :
      "Listing saved but is not yet public. Please try again shortly.");
  };
  return <section id="acquisition" className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
    <h2 className="text-xl font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-neutral-600">Let potential buyers contact you on Rocket. Verify your app’s domain to publish a listing. Rocket does not guarantee legal ownership.</p>
    {!listing && initialPriceSuggestion.current && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">An illustrative valuation has been suggested as the asking price. Edit or clear it, then save your listing.</p>}
    {typeof suggestedPrice === "number" && priceSuggestion && priceSuggestion !== price && <button type="button" onClick={() => setPrice(priceSuggestion)} className="mt-3 text-sm font-semibold text-sky-700 hover:underline">Use ${Number(priceSuggestion).toLocaleString()} valuation as asking price</button>}
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Acquisition status
        <select value={status} onChange={(event) => setStatus(event.target.value as AcquisitionListing["status"])} className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3">
          <option value="not_for_sale">Not for sale</option><option value="open_to_offers">Open to offers</option><option value="for_sale">For sale</option>
        </select>
      </label>
      {status === "for_sale" && <label className="text-sm font-medium">Asking price (USD, optional)
        <input type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-300 px-3" />
      </label>}
    </div>
    {status !== "not_for_sale" && <div className="mt-4 grid gap-4">
      <label className="text-sm font-medium">Short description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-xl border border-neutral-300 p-3" rows={3} /></label>
      <label className="text-sm font-medium">Reason for selling (optional)<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-300 px-3" /></label>
      <label className="text-sm font-medium">Preferred buyer (optional)<input maxLength={500} value={buyer} onChange={(event) => setBuyer(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-neutral-300 px-3" /></label>
    </div>}
    <p className="mt-4 text-sm text-neutral-600">{enquiries} {enquiries === 1 ? "acquisition enquiry" : "acquisition enquiries"} · <Link to="/inbox" className="font-medium text-sky-700 hover:underline">Open Inbox</Link></p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
    <button type="button" disabled={busy} onClick={() => void save()} className="mt-4 min-h-11 rounded-xl bg-[#167ac6] px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save acquisition settings"}</button>
  </section>;
}
