import { useState } from "react";
import { appBadgeEmbed, appBadgeUrl, badgePath, type BadgeTheme } from "@/lib/appBadge";

export default function AppBadgeKit({ appId, appName }: { appId: string; appName: string }) {
  const [theme, setTheme] = useState<BadgeTheme>("black");
  const [notice, setNotice] = useState("");
  const embed = appBadgeEmbed(appId, theme);
  return <section aria-label={`${appName} Rocket badge`} className="mt-5 border-t border-neutral-100 pt-4">
    <div>
      <h3 className="text-lg font-semibold">Discover it on Rocket</h3>
      <p className="mt-2 text-sm text-neutral-600">Add a Rocket badge to your website, footer or launch page. It links directly to your app’s public listing.</p>
      <p className="mt-2 text-sm text-neutral-600">Your public Rocket listing includes a dofollow link to your website.</p>
      <fieldset className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-2 font-medium">Badge appearance</legend>
        {(["black", "white"] as const).map((value) => <label key={value} className="flex min-h-11 items-center gap-2">
          <input type="radio" name={`badge-theme-${appId}`} value={value} checked={theme === value} onChange={() => { setTheme(value); setNotice(""); }} />
          {value === "black" ? "Black" : "White"}
        </label>)}
      </fieldset>
      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-100 p-5">
        <a href={appBadgeUrl(appId)} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${appName} on Rocket`} className="inline-block focus-visible:outline-2 focus-visible:outline-sky-700">
          <img src={badgePath(theme)} alt="Discover it on Rocket" width={220} height={68} className="h-auto max-w-full" />
        </a>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white" onClick={async () => {
          try { await navigator.clipboard.writeText(embed); setNotice("Embed code copied."); }
          catch { setNotice("Could not copy automatically. Select and copy the code below."); }
        }}>Copy embed code</button>
        <a href={badgePath(theme)} download={`discover-it-on-rocket-${theme}.svg`} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium">Download SVG</a>
      </div>
      <label className="mt-4 block text-sm font-medium">Website embed code
        <textarea readOnly value={embed} aria-label={`${appName} Rocket badge embed code`} onFocus={(event) => event.currentTarget.select()} rows={4} className="mt-2 w-full rounded-lg border bg-neutral-50 p-3 font-mono text-xs" />
      </label>
      <p className="mt-3 text-xs text-neutral-500">Keep the badge proportions, leave space around it, and display it at least 44px tall. Use the supplied artwork without animation or added claims. A listing badge does not imply Rocket endorsement or verification.</p>
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    </div>
  </section>;
}
