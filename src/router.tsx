import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Ported from the old App.tsx <Suspense> fallback around lazy-loaded pages.
    defaultPendingComponent: () => (
      <div className="grid min-h-[60vh] place-items-center text-sm text-neutral-500">Loading Rocket…</div>
    ),
  });

  return router;
};
