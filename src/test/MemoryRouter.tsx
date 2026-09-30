import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

type TestRouteProps = { path: string; element: ReactNode };

// Test-only equivalents for the small v6-style route fixtures kept by the
// pre-migration tests. The components under test still use the real TanStack router.
export function Route(_props: TestRouteProps) {
  return null;
}

export function Routes({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function MemoryRouter({
  children,
  initialEntries = ["/"],
}: {
  children: ReactNode;
  initialEntries?: string[];
}) {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Outlet });
    const routeElements =
      isValidElement(children) && children.type === Routes
        ? Children.toArray((children.props as { children: ReactNode }).children)
        : [];
    const routeTree = routeElements.length
      ? root.addChildren(
          routeElements
            .filter(
              (element): element is ReactElement<TestRouteProps> =>
                isValidElement<TestRouteProps>(element) &&
                element.type === Route,
            )
            .map((element) =>
              createRoute({
                getParentRoute: () => root,
                path: element.props.path,
                component: () => element.props.element,
              }),
            ),
        )
      : root.addChildren([
          createRoute({
            getParentRoute: () => root,
            path: "/",
            component: () => children,
          }),
          createRoute({
            getParentRoute: () => root,
            path: "$",
            component: () => children,
          }),
        ]);
    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries }),
    });
  });

  return <RouterProvider router={router} />;
}
