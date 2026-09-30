import { Link } from "@/lib/router-compat";

// Marketplace checkout is not public yet. Rocket Connect's current checkout is
// test-mode and requires an app-issued token; Rocket ID alone is not eligibility.
export default function AppPurchaseActions({
  appId,
  light = false,
  showOpen = true,
}: {
  appId: string;
  light?: boolean;
  showOpen?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="App actions">
      {showOpen && (
        <Link
          to={`/apps/${appId}`}
          className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6] ${light ? "border-white/70 bg-white text-[#075985] hover:bg-neutral-100" : "border-[#167ac6] bg-[#167ac6] text-white hover:bg-[#1268aa]"}`}
        >
          Open
        </Link>
      )}
      <button
        type="button"
        disabled
        title="Buy will be available when this app enables a public Rocket payment offer."
        aria-label="Buy unavailable: this app has no public Rocket payment offer"
        className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold opacity-55 ${light ? "border-white/60 text-white" : "border-neutral-300 bg-neutral-100 text-neutral-600"}`}
      >
        Buy
      </button>
    </div>
  );
}
