import SiteHeader from "@/components/SiteHeader";
import { RankedAppRow, StandardAppCard } from "@/components/MarketplaceCards";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import type { ShelfItem } from "@/lib/homeMerchandising";
import { Link } from "@tanstack/react-router";

export default function CuratedApps({
  kind,
  rows,
  collection,
  page = 0,
  hasMore = false,
}: {
  kind: "rising" | "picks";
  rows: ShelfItem[];
  collection?: string;
  page?: number;
  hasMore?: boolean;
}) {
  const save = useSavedAppControls(rows.map((row) => row.app.id));
  return (
    <div className="marketplace-page min-h-screen bg-white pb-16">
      <SiteHeader />
      <main className="mx-auto max-w-[90rem] px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {kind === "rising" ? "Rising on Rocket" : collection || "Our picks"}
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          {kind === "rising"
            ? "Most viewed app pages on Rocket. Views are counted since tracking began; repeat visits from the same browser/network to an app in a day count once."
            : "Human-selected apps from Rocket’s editorial team."}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {rows.map((row, index) =>
            kind === "rising" ? (
              <RankedAppRow
                key={row.app.id}
                app={row.app}
                rank={page * 20 + index + 1}
                {...save(row.app.id)}
              />
            ) : (
              <div key={row.app.id}>
                <StandardAppCard
                  app={row.app}
                  {...save(row.app.id)}
                  eyebrow="Rocket Pick"
                />
                {row.pick?.headline && (
                  <p className="mt-2 text-sm text-neutral-600">
                    {row.pick.headline}
                  </p>
                )}
              </div>
            ),
          )}
        </div>
        {!rows.length && (
          <p className="mt-8 text-sm text-neutral-500">
            No eligible apps are available here right now.
          </p>
        )}
        {kind === "rising" && (page > 0 || hasMore) && (
          <nav aria-label="Rising pages" className="mt-8 flex items-center justify-center gap-4">
            {page > 0 ? (
              <Link to="/rising" search={{ page: page - 1 }} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm">
                Previous
              </Link>
            ) : <span className="rounded-lg border border-neutral-200 px-4 py-2 text-sm opacity-40">Previous</span>}
            <span className="text-sm text-neutral-500">Page {page + 1}</span>
            {hasMore ? (
              <Link to="/rising" search={{ page: page + 1 }} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm">
                Next
              </Link>
            ) : <span className="rounded-lg border border-neutral-200 px-4 py-2 text-sm opacity-40">Next</span>}
          </nav>
        )}
      </main>
    </div>
  );
}
