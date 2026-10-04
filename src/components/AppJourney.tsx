import { Link } from "@/lib/router-compat";
import IntegrationLogo from "@/components/IntegrationLogo";

export type MyApp = { id: string; app_id: string; status: string; verification_state: string;
  owned: boolean; owner_verification_level: string | null;
  app: { name?: string; website_url?: string; logo_url?: string | null; claim_state?: string } | null };

export default function AppJourney({ item }: { item: MyApp }) {
  const domainVerified = item.owned && item.owner_verification_level === "domain_verified";
  return <div className="mt-5 border-t border-neutral-100 pt-4 text-sm">
    {!domainVerified ? item.status === "review" ? <p className="font-medium text-neutral-700">Ownership review pending. We’ll let you know when there is an update.</p>
      : <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Prove this app is yours</p><p className="mt-1 text-neutral-600">Verify control of its website to build trust in the public listing.</p></div><Link to={`/apps/add?app=${item.app_id}`} className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white">Verify domain</Link></div>
      : <div>
        <p className="font-semibold text-neutral-900">Domain verified</p>
        <p className="mt-1 text-neutral-600">Your public listing shows that you control the website.</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <Link to={`/my-apps/${item.app_id}/analytics`} className="inline-flex min-h-11 items-center gap-2 font-medium text-sky-800 hover:underline"><IntegrationLogo provider="google-analytics" />Connect Google Analytics</Link>
            <p className="text-xs text-neutral-500">Verify your app’s traffic.</p>
          </div>
          <div>
            <Link to={`/my-apps/${item.app_id}/revenue`} className="inline-flex min-h-11 items-center gap-2 font-medium text-sky-800 hover:underline"><IntegrationLogo provider="stripe" />Connect Stripe</Link>
            <p className="text-xs text-neutral-500">Verify revenue. Payment setup is separate.</p>
          </div>
        </div>
      </div>}
  </div>;
}
