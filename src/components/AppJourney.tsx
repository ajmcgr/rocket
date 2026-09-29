import { Link } from "react-router-dom";

export type MyApp = { id: string; app_id: string; status: string; verification_state: string;
  owned: boolean; owner_verification_level: string | null;
  app: { name?: string; website_url?: string; logo_url?: string | null; claim_state?: string } | null };

export default function AppJourney({ item }: { item: MyApp }) {
  const domainVerified = item.owned && item.owner_verification_level === "domain_verified";
  return <div className="mt-5 border-t border-neutral-100 pt-4">
    <h3 className="text-sm font-semibold">Build trust around your app</h3>
    <ol className="mt-3 space-y-3 text-sm">
      <li><span className="font-medium">1. Claim ownership</span> · {item.owned ? "Claimed" : item.status === "review" ? "Review pending" : "Not yet verified"} {!item.owned && <Link to={`/apps/add?app=${item.app_id}`} className="ml-2 text-sky-700">Continue claim</Link>}</li>
      <li><span className="font-medium">2. Verify domain</span> · {domainVerified ? "Domain verified" : "Verification required"} {!domainVerified && <Link to={`/apps/add?app=${item.app_id}`} className="ml-2 text-sky-700">Verify</Link>}</li>
      <li><span className="font-medium">3. Verify traction</span> · {domainVerified ? <Link to={`/my-apps/${item.app_id}/analytics`} className="text-sky-700">Google Analytics settings</Link> : "Available after domain verification"} <span className="text-neutral-500">· Stripe Revenue pilot gated</span></li>
      <li><span className="font-medium">4. Connect to Rocket</span> · <Link to="/developer" className="text-sky-700">Rocket Identity and Payments test program</Link><span className="text-neutral-500"> (invitation-only; registration alone does not mark this listing Connected)</span></li>
      <li><span className="font-medium">5. Get discovered</span> · <span className="text-neutral-600">Verified, permissioned signals help users understand your app and may qualify it for future Rocket editorial features. No ranking boost is promised.</span></li>
    </ol>
    <p className="mt-4 text-xs text-neutral-500">Connected data stays private unless you choose Verified only, Range, or Exact in its settings. Public visibility does not grant Rocket permission to use your metric in external marketing.</p>
  </div>;
}
