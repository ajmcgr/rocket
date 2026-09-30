const line = "rounded-lg bg-neutral-100";

export default function RoutePendingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      aria-busy="true"
      className="rocket-skeleton-surface min-h-screen"
    >
      <aside aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-60 border-r border-neutral-200 p-5 lg:block">
        <div className={`h-9 w-32 ${line}`} />
        <div className="mt-12 space-y-4">
          <div className={`h-3 w-20 ${line}`} />
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className={`h-9 w-full ${line}`} />)}
          <div className={`h-3 w-20 ${line}`} />
          {[0, 1, 2].map((item) => <div key={item} className={`h-9 w-full ${line}`} />)}
        </div>
      </aside>
      <div className="lg:ml-60">
        <div aria-hidden="true" className="flex h-16 items-center gap-4 border-b border-neutral-200 px-5 sm:px-8">
          <div className={`h-9 w-9 lg:hidden ${line}`} />
          <div className={`h-10 w-full max-w-lg ${line}`} />
          <div className={`ml-auto h-9 w-20 ${line}`} />
        </div>
        <main aria-hidden="true" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
          <div className={`h-4 w-24 ${line}`} />
          <div className={`mt-5 h-11 w-full max-w-xl ${line}`} />
          <div className={`mt-4 h-5 w-full max-w-md ${line}`} />
          <div className={`mt-9 h-12 w-full max-w-2xl ${line}`} />
          <div className="mt-9 flex gap-3">
            {[0, 1, 2, 3].map((item) => <div key={item} className={`h-9 w-24 ${line}`} />)}
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="rounded-2xl border border-neutral-200 p-5">
                <div className={`h-12 w-12 ${line}`} />
                <div className={`mt-5 h-5 w-3/4 ${line}`} />
                <div className={`mt-3 h-4 w-full ${line}`} />
                <div className={`mt-2 h-4 w-2/3 ${line}`} />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
