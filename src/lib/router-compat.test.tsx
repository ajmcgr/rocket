import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { Navigate, useLocation } from "./router-compat";

describe("protected route redirects", () => {
  it("does not repeatedly restart navigation while the destination is loading", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("scrollTo", vi.fn());
    const rootRoute = createRootRoute({ component: Outlet });
    // The auth gate remains mounted while the login chunk/loader is pending.
    function Gate() {
      useLocation();
      return <Navigate to="/login?next=%2Fdeveloper" state={{ from: "/developer" }} replace />;
    }
    let finishLogin!: () => void;
    const waiting = new Promise<void>((resolve) => { finishLogin = resolve; });
    const developer = createRoute({ getParentRoute: () => rootRoute, path: "/developer", component: Gate });
    const login = createRoute({ getParentRoute: () => rootRoute, path: "/login", loader: () => waiting, component: () => <p>Log in</p> });
    const router = createRouter({ routeTree: rootRoute.addChildren([developer, login]), history: createMemoryHistory({ initialEntries: ["/developer"] }), defaultPendingMs: 1000 });
    const navigate = vi.spyOn(router, "navigate");
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<RouterProvider router={router} />); });
      expect(navigate).toHaveBeenCalledTimes(1);
      await act(async () => { finishLogin(); await router.latestLoadPromise; });
      expect(container.textContent).toContain("Log in");
      expect(router.state.location.search).toEqual({ next: "/developer" });
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
