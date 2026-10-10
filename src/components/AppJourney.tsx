import { Link } from "@/lib/router-compat";
import IntegrationLogo from "@/components/IntegrationLogo";

export type MyApp = { id: string; app_id: string; status: string; verification_state: string;
  review_reason?: string | null; completed_at?: string | null; rejected_at?: string | null;
  owned: boolean; owner_verification_level: string | null;
  app: { slug?: string; name?: string; website_url?: string; logo_url?: string | null; claim_state?: string } | null };

export default function AppJourney({ item }: { item: MyApp }) {
  const domainVerified = item.owned && item.owner_verification_level === "domain_verified";
  return <div className="mt-5 border-t border-neutral-100 pt-4 text-sm">
    {item.review_reason && <p className="mb-3 whitespace-pre-wrap text-neutral-700"><strong>Ownership review:</strong> {item.review_reason}</p>}
    {!domainVerified ? item.status === "review" ? <p className="font-medium text-neutral-700">Ownership review pending. We’ll let you know when there is an update.</p>
      : <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Prove this app is yours</p><p className="mt-1 text-neutral-600">Verify control of its website to build trust in the public listing.</p></div><Link to={`/apps/add?app=${item.app_id}`} className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white">Verify domain</Link></div>
      : <div>
        <p className="font-semibold text-neutral-900">Domain verified</p>
        <p className="mt-1 text-neutral-600">Your public listing shows that you control the website.</p>
        <div className="mt-5 grid grid-cols-1 gap-3" aria-label="Connect analytics and revenue">
          <Link to={`/my-apps/${item.app_id}/analytics`} className="group flex min-h-24 items-center gap-4 rounded-xl border border-neutral-200 p-5 transition hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
            <IntegrationLogo provider="google-analytics" />
            <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-sky-800">Connect Google Analytics</span><span className="mt-1 block text-sm text-neutral-600">Verify your app’s traffic.</span></span>
            <span aria-hidden="true" className="text-xl text-sky-800">→</span>
          </Link>
          <Link to={`/my-apps/${item.app_id}/revenue`} className="group flex min-h-24 items-center gap-4 rounded-xl border border-neutral-200 p-5 transition hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">
            <IntegrationLogo provider="stripe" />
            <span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-sky-800">Connect Stripe</span><span className="mt-1 block text-sm text-neutral-600">Verify revenue. Payment setup is separate.</span></span>
            <span aria-hidden="true" className="text-xl text-sky-800">→</span>
          </Link>
          {(["Polar", "Dodo Payments"] as const).map((provider) => <div key={provider} className="flex min-h-24 items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            <span className="text-lg font-semibold text-neutral-700">{provider}</span>
            <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700">Coming soon</span>
          </div>)}
        </div>
      </div>}
  </div>;
}
