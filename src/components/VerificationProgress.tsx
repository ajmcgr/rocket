import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import RocketShare from "@/components/RocketShare";
import { supabase } from "@/integrations/supabase/client";
import { verificationPhase } from "@/lib/verificationJourney";
import { trackVerificationJourney } from "@/lib/verificationAnalytics";

type Props = {
  appId: string;
  kind: "analytics" | "revenue";
  provider: "ga4" | "posthog" | "stripe" | "revenuecat" | "polar" | "dodo";
  connected: boolean;
  status?: string | null;
  lastError?: string | null;
  successfulSync?: string | null;
  eligibleLive?: boolean;
  visibility: string | string[];
  visibilityTarget?: string;
};

/** Reads the existing owner-only provider selection; a connected but inactive provider is not public. */
export default function VerificationProgress(props: Props) {
  const [selected, setSelected] = useState<boolean | null>(null);
  useEffect(() => {
    if (!props.connected) { setSelected(false); return; }
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase.functions.invoke("rocket-app-provider-selection", {
        body: { action: "status", app_id: props.appId },
      });
      if (alive) setSelected(error ? null : data?.[props.kind === "analytics" ? "analytics_provider" : "revenue_provider"] === props.provider);
    };
    void refresh();
    window.addEventListener("rocket-provider-selection-updated", refresh);
    return () => { alive = false; window.removeEventListener("rocket-provider-selection-updated", refresh); };
  }, [props.appId, props.kind, props.provider, props.connected, props.successfulSync]);
  if (selected === null) return null;
  const phase = verificationPhase({ ...props, selected });
  if (phase === "unconnected") return null;
  const copy: Record<Exclude<typeof phase, "unconnected">, [string, string]> = {
    pending: ["Connection successful. Your metrics are being verified.", "Finish setup or sync this provider to confirm eligible metrics. Nothing has been published."],
    failed: ["We couldn't verify your metrics yet.", "Use the sync or reconnection control on this page, then check this status again."],
    stale: ["Your verification needs a fresh sync.", "Use Sync now to refresh this source before sharing current verified metrics."],
    inactive: ["This source has synced privately.", "Select it as this app's active provider before sharing verification from this source."],
    ineligible: ["This sync remains private.", "Only a fully supported live verification can appear on a public Rocket listing. Sandbox data stays private."],
    private: ["Your app's traction is verified and private.", "Your verified metrics are ready. Choose what you'd like to share."],
    verified_only: ["Your verification status is visible.", "The verified badge appears on your listing. Your metric amount remains private."],
    public: ["Your verified metrics are now visible on your Rocket listing.", "Preview what visitors see, then share your verified profile."],
  };
  return <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-sm dark:border-sky-900 dark:bg-sky-950/30" aria-live="polite">
    <p className="font-semibold">{copy[phase][0]}</p>
    <p className="mt-1 text-neutral-600 dark:text-neutral-300">{copy[phase][1]}</p>
    {(phase === "private" || phase === "verified_only" || phase === "public") && <div className="mt-3 flex flex-wrap items-center gap-3">
      <a href={`#${props.visibilityTarget || "verification-visibility"}`} className="font-medium text-sky-700 dark:text-sky-300">Manage visibility</a>
      <Link to={`/apps/${props.appId}`} onClick={() => trackVerificationJourney("verification_profile_preview_clicked", props)} className="font-medium text-sky-700 dark:text-sky-300">Preview public profile</Link>
      <RocketShare kind="app" identifier={props.appId} title="this app" label={phase === "private" ? "Share app" : "Share verified profile"}
        onOpen={() => trackVerificationJourney("verification_share_clicked", props)} />
    </div>}
  </div>;
}
