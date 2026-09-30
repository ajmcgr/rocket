export const CardSkeleton = () => (
  <div className="rocket-skeleton-surface overflow-hidden rounded-2xl border border-neutral-200">
    <div className="aspect-square w-full animate-pulse bg-neutral-100" />
    <div className="space-y-2 border-t border-neutral-100 p-3">
      <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
      <div className="h-2.5 w-1/2 animate-pulse rounded bg-neutral-100" />
    </div>
  </div>
);

export const ProjectCardSkeleton = () => (
  <div className="rocket-skeleton-surface rounded-2xl border border-neutral-200 p-5">
    <div className="flex items-start gap-3">
      <div className="h-10 w-10 animate-pulse rounded-lg bg-neutral-100" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-100" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-neutral-100" />
      </div>
    </div>
  </div>
);

export const AssetGridSkeleton = ({ count = 8 }: { count?: number }) => (
  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
  </div>
);

export const ProjectGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: count }).map((_, i) => <ProjectCardSkeleton key={i} />)}
  </div>
);
