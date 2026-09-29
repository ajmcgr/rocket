import { trustLabels, type AppTrust } from "@/lib/appTrust";

export default function AppTrustBadges({ trust, compact = false }: { trust?: AppTrust | null; compact?: boolean }) {
  const labels = trustLabels(trust);
  if (!labels.length) return null;
  return <div className={`flex flex-wrap gap-1.5 ${compact ? "mt-3" : ""}`} aria-label="App trust evidence">
    {labels.map((label) => <span key={label} className={`rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 ${compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"}`}>{label}</span>)}
  </div>;
}
