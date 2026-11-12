import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { acquisitionDb as db, askingPrice, publicListing, type PublicAcquisitionListing } from "@/lib/rocketAcquisition";
import { track } from "@/lib/analytics";

export default function AppAcquisitionCard({ appId }: { appId: string }) {
  const { user } = useAuth();
  const [listing, setListing] = useState<PublicAcquisitionListing | null>(null);
  useEffect(() => {
    let active = true;
    void db.from("public_rocket_acquisition_listings").select("*").eq("app_id", appId).maybeSingle()
      .then(({ data, error }: any) => { if (active && !error && publicListing(data)) setListing(data); });
    return () => { active = false; };
  }, [appId]);
  if (!listing || !publicListing(listing)) return null;
  return <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 sm:p-6" aria-label="Acquisition availability">
    <h2 className="text-xl font-semibold">{listing.status === "for_sale" ? "This app is for sale" : "Open to acquisition offers"}</h2>
    {listing.status === "for_sale" && <p className="mt-2 font-semibold">Asking price: {askingPrice(listing.asking_price_cents)}</p>}
    <p className="mt-2 text-sm text-neutral-700">{listing.status === "for_sale" ? "Interested in acquiring this app? Contact the owner directly." : "This app’s owner is open to discussing a potential acquisition."}</p>
    {listing.description && <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{listing.description}</p>}
    <p className="mt-3 text-xs text-neutral-500">Seller-provided information. Rocket has reviewed listing eligibility but does not guarantee legal ownership. Public verification badges elsewhere on this profile use their existing visibility settings.</p>
    <Link to={`/inbox?start=${encodeURIComponent(appId)}`} onClick={() => track("contact_founder_clicked", { app_id: appId, authenticated: !!user })} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#167ac6] px-5 text-sm font-semibold text-white hover:bg-[#1268aa]">Contact Founder →</Link>
  </section>;
}
