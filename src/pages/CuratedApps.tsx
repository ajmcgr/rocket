import SiteHeader from "@/components/SiteHeader";
import { RankedAppRow, StandardAppCard } from "@/components/MarketplaceCards";
import { useSavedAppControls } from "@/hooks/useSavedAppControls";
import type { ShelfItem } from "@/lib/homeMerchandising";

export default function CuratedApps({
  kind,
  rows,
  collection,
}: {
  kind: "rising" | "picks";
  rows: ShelfItem[];
  collection?: string;
}) {
  const save = useSavedAppControls(rows.map((row) => row.app.id));
  return (
    <div className="marketplace-page min-h-screen bg-white pb-16">
      <SiteHeader />
      <main className="mx-auto max-w-[90rem] px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {kind === "rising"
            ? "Rising on Rocket"
            : collection || "Rocket Picks"}
        </h1>
        <p className="mt-3 text-sm text-neutral-600">
          {kind === "rising"
            ? "Cohort-relative public Launch vote activity. These are imported Launch signals, not Rocket traffic or usage."
            : "Human-selected apps from Rocket’s editorial team."}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {rows.map((row, index) =>
            kind === "rising" ? (
              <RankedAppRow
                key={row.app.id}
                app={row.app}
                rank={index + 1}
                {...save(row.app.id)}
                eyebrow={`${row.signal!.net_votes} net Launch votes`}
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
      </main>
    </div>
  );
}
