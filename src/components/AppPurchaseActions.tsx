import { Link } from "@/lib/router-compat";

// Marketplace checkout is not public yet. Rocket Developer's current checkout is
// test-mode and requires an app-issued token; Rocket ID alone is not eligibility.
export default function AppPurchaseActions({
  appId,
  appSlug,
  light = false,
  showView = true,
  compact = false,
}: {
  appId: string;
  appSlug?: string | null;
  light?: boolean;
  showView?: boolean;
  compact?: boolean;
}) {
  const size = compact
    ? "min-h-11 sm:min-h-9 rounded-lg px-2.5 text-xs"
    : "min-h-10 rounded-xl px-3 text-sm";
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="App actions">
      {showView && (
        <Link
          to={`/apps/${appSlug || appId}`}
          className={`inline-flex ${size} items-center justify-center border bg-transparent font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6] ${light ? "border-white/80 text-white hover:bg-white/10" : "border-[#167ac6] text-[#167ac6] hover:bg-[#167ac6]/10 dark:text-[#dcefff] dark:hover:bg-[#167ac6]/20"}`}
        >
          View
        </Link>
      )}
    </div>
  );
}
