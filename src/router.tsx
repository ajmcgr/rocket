import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import RoutePendingSkeleton from "./components/RoutePendingSkeleton";
import { createScrollRestorationKey } from "./lib/scroll-restoration";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    getScrollRestorationKey: createScrollRestorationKey(),
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 0,
    defaultPendingMinMs: 200,
    defaultPendingComponent: RoutePendingSkeleton,
  });

  return router;
};
