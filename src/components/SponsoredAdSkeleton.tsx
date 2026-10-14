export default function SponsoredAdSkeleton({
  category = false,
}: {
  category?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Loading sponsored app"
      aria-busy="true"
      className={`min-h-36 min-w-0 rounded-2xl border border-neutral-200 bg-transparent p-5 dark:border-neutral-800 ${category ? "mt-8 sm:p-6" : ""}`}
    >
      <div aria-hidden="true" className="flex min-h-[6.5rem] flex-col justify-between motion-safe:animate-pulse">
        <div className="h-5 w-24 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-4 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-28 max-w-full rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-3 w-48 max-w-full rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="h-11 w-24 shrink-0 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
