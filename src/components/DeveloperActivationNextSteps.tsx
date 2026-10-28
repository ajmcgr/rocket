import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyApps } from "@/lib/myApps";
import type { MyApp } from "@/components/AppJourney";

/** Ephemeral guidance after success, never a replacement for ownership checks. */
export default function DeveloperActivationNextSteps({ appId, item }: { appId: string; item?: MyApp | null }) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [access, setAccess] = useState<{ userId: string; appId: string; item: MyApp | null } | null>(null);
  useEffect(() => {
    let current = true;
    setAccess(null);
    setDismissed(false);
    if (item !== undefined || !user?.id) return;
    void loadMyApps().then(items => {
      if (current) setAccess({userId: user.id, appId, item: items.find(row => row.app_id === appId) || null});
    }).catch(() => {});
    return () => { current = false; };
  }, [appId, user?.id, item]);
  const owned = item !== undefined ? item : access && access.userId === user?.id && access.appId === appId ? access.item : null;
  const eligible = owned?.owned && owned.app_id === appId && owned.owner_verification_level === "domain_verified";
  if (dismissed || !user) return null;
  return <section aria-label="Optional developer next steps" className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Prove your app's traction.</h3><button type="button" className="min-h-11 shrink-0 text-sm underline" onClick={() => setDismissed(true)}>Skip for now</button></div>
    <p className="text-sm text-neutral-600">Connect your analytics or revenue provider to showcase verified performance on Rocket. Complete your profile and share the metrics you choose to make public.</p>
    <ul className="mt-3 space-y-3 text-sm">
      <li><Link to="/settings/profile" className="font-semibold text-sky-800 dark:text-sky-300 hover:underline">Complete your developer profile →</Link><p className="text-neutral-600">Give your apps a recognizable builder identity.</p></li>
      {eligible ? <>
        <li><Link to={`/my-apps/${appId}/analytics`} className="font-semibold text-sky-800 dark:text-sky-300 hover:underline">Connect analytics →</Link><p className="text-neutral-600">Verify real traffic with an available analytics provider.</p></li>
        <li><Link to={`/my-apps/${appId}/revenue`} className="font-semibold text-sky-800 dark:text-sky-300 hover:underline">Connect revenue →</Link><p className="text-neutral-600">Choose a supported revenue source in your app settings. Stripe remains subject to its availability gate.</p></li>
      </> : <li><Link to={`/apps/add?app=${encodeURIComponent(appId)}`} className="font-semibold text-sky-800 dark:text-sky-300 hover:underline">Verify your domain →</Link><p className="text-neutral-600">Analytics and revenue connections require eligible app ownership.</p></li>}
      <li><strong>Share your listing</strong><p className="text-neutral-600">Use Share to show your app and the verified metrics you choose to make public.</p></li>
    </ul>
    <p className="mt-3 text-xs text-neutral-500">Metrics stay private by default. Choose one analytics and one revenue provider per app; you control public visibility.</p>
  </section>;
}
