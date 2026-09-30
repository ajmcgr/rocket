const block = "rounded-lg bg-neutral-100";

export function AppProfileContentSkeleton() {
  return (
    <div className="rocket-skeleton-surface mt-7 animate-pulse" aria-hidden="true">
      <div className="flex items-start gap-4 border-b border-neutral-200 pb-8 sm:gap-6">
        <div className={`h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24 ${block}`} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className={`h-3 w-24 ${block}`} />
          <div className={`h-9 w-2/3 max-w-md sm:h-12 ${block}`} />
          <div className={`h-5 w-full max-w-xl ${block}`} />
          <div className={`h-5 w-3/4 max-w-md ${block}`} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-b border-neutral-200 pb-8">
        <div className={`h-11 w-36 rounded-xl ${block}`} />
        <div className={`h-11 w-24 rounded-xl ${block}`} />
        <div className={`h-11 w-24 rounded-xl ${block}`} />
      </div>
      <div className="mt-8 space-y-3">
        <div className={`h-7 w-40 ${block}`} />
        <div className={`h-4 w-full ${block}`} />
        <div className={`h-4 w-11/12 ${block}`} />
        <div className={`h-4 w-4/5 ${block}`} />
      </div>
      <div className="mt-8">
        <div className={`h-7 w-52 ${block}`} />
        <div className="mt-4 flex gap-4 overflow-hidden">
          {[0, 1].map((item) => <div key={item} className={`h-48 w-[min(78vw,28rem)] shrink-0 rounded-2xl sm:h-64 ${block}`} />)}
        </div>
      </div>
      <div className="mt-8 border-t border-neutral-200 pt-7">
        <div className={`h-7 w-28 ${block}`} />
        <div className={`mt-5 h-20 w-full rounded-xl ${block}`} />
      </div>
    </div>
  );
}

export function AppProfileRouteSkeleton() {
  return (
    <div role="status" aria-label="Loading app profile" aria-busy="true" className="min-h-screen bg-white">
      <aside aria-hidden="true" className="rocket-skeleton-surface fixed inset-y-0 left-0 hidden w-60 border-r border-neutral-200 p-5 lg:block">
        <div className={`h-9 w-36 ${block}`} />
        <div className="mt-14 space-y-4">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className={`h-9 w-full ${block}`} />)}
        </div>
      </aside>
      <div className="lg:ml-60">
        <div className="rocket-skeleton-surface flex h-20 items-center justify-between border-b border-neutral-200 px-5 sm:px-8" aria-hidden="true">
          <div className={`h-9 w-36 lg:hidden ${block}`} />
          <div className={`hidden h-11 w-full max-w-lg sm:block ${block}`} />
          <div className={`h-10 w-24 ${block}`} />
        </div>
        <main className="mx-auto max-w-6xl px-5 pb-20 pt-6 sm:px-8">
          <div className={`rocket-skeleton-surface h-4 w-32 animate-pulse ${block}`} aria-hidden="true" />
          <AppProfileContentSkeleton />
        </main>
      </div>
    </div>
  );
}

export function AppCardSkeleton({ saved = false }: { saved?: boolean }) {
  return (
    <div className={`rocket-skeleton-surface flex animate-pulse flex-col rounded-2xl border border-neutral-200 p-5 ${saved ? "min-h-52" : "min-h-56"}`} aria-hidden="true">
      <div className="flex items-start gap-3">
        <div className={`h-12 w-12 shrink-0 rounded-xl ${block}`} />
        <div className="flex-1 space-y-2">
          <div className={`h-5 w-3/4 ${block}`} />
          <div className={`h-3 w-1/2 ${block}`} />
        </div>
      </div>
      <div className={`mt-5 h-4 w-full ${block}`} />
      <div className={`mt-2 h-4 w-4/5 ${block}`} />
      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <div className={`h-3 w-1/3 ${block}`} />
        <div className="flex gap-2">
          <div className={`h-9 w-16 ${block}`} />
          <div className={`h-9 w-14 ${block}`} />
        </div>
      </div>
    </div>
  );
}

export function RankedAppRowSkeleton() {
  return (
    <div className="rocket-skeleton-surface flex min-h-20 animate-pulse items-center gap-3 border-b border-neutral-200 py-3" aria-hidden="true">
      <div className={`h-4 w-5 ${block}`} />
      <div className={`h-11 w-11 shrink-0 rounded-xl ${block}`} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`h-4 w-1/2 ${block}`} />
        <div className={`h-3 w-3/4 ${block}`} />
      </div>
      <div className={`h-9 w-16 ${block}`} />
    </div>
  );
}

export function SavedAppsRouteSkeleton() {
  return (
    <main role="status" aria-label="Loading saved apps" aria-busy="true" className="rocket-skeleton-surface mx-auto min-h-screen max-w-5xl animate-pulse px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
      <div className={`h-4 w-24 ${block}`} />
      <div className={`mt-6 h-12 w-64 ${block}`} />
      <div className={`mt-4 h-4 w-full max-w-xl ${block}`} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => <AppCardSkeleton key={item} saved />)}
      </div>
    </main>
  );
}
