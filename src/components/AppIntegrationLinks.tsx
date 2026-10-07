import { BarChart3, ShieldCheck } from "lucide-react";
import { Link } from "@/lib/router-compat";
import IntegrationLogo from "./IntegrationLogo";

const integrations = [
  { name: "Google Analytics", description: "Connect a GA4 property to verify your app’s traffic. Manage access and disconnect from My Apps.", to: "/your-apps", action: "Choose an app", logo: "google-analytics" },
  { name: "PostHog", description: "Review your app’s PostHog connection and disconnect existing access from My Apps. Setup availability depends on the app’s analytics tools.", to: "/your-apps", action: "View app connections" },
  { name: "Stripe · revenue verification", description: "Connect Stripe to verify your app’s revenue. This is separate from accepting payments with Buy with Rocket.", to: "/your-apps", action: "Choose an app", logo: "stripe" },
  { name: "Stripe · Buy with Rocket", description: "Set up Stripe merchant onboarding and paid access plans for eligible apps you own.", to: "/buy-with-rocket", action: "Manage payments", logo: "stripe" },
  { name: "Rocket ID", description: "Configure sign-in with Rocket for your app, including redirect URLs and integration credentials.", to: "/rocket-id", action: "Set up Rocket ID" },
] as const;

export default function AppIntegrationLinks() {
  return <div className="mt-6 space-y-3">
    <p className="text-sm leading-relaxed text-neutral-600">Analytics and payment connections belong to individual apps. Choose your app to see its connection status, setup options and disconnect controls.</p>
    {integrations.map((integration) => <div key={integration.name} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-50 text-brand">
          {"logo" in integration ? <IntegrationLogo provider={integration.logo} /> : integration.name === "Rocket ID" ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <BarChart3 className="h-5 w-5" aria-hidden="true" />}
        </div>
        <div><h3 className="text-sm font-semibold text-neutral-900">{integration.name}</h3><p className="mt-1 text-xs leading-relaxed text-neutral-600">{integration.description}</p></div>
      </div>
      <Link to={integration.to} className="inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-3 text-sm font-medium text-brand hover:bg-neutral-50">{integration.action}</Link>
    </div>)}
  </div>;
}
