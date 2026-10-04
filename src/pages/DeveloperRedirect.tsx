import { Navigate, useLocation } from "@/lib/router-compat";
import { useRef } from "react";
export default function DeveloperRedirect() {
  const location = useLocation();
  const hash = location.hash.replace(/^#/, "");
  const target =
    hash === "buy-with-rocket"
      ? "/buy-with-rocket"
      : hash === "rocket-id"
        ? "/rocket-id"
        : "/settings/developer";
  // Keep the original destination while navigation is pending: the old route
  // can remain mounted after the router has already cleared its hash.
  const destination = useRef(`${target}${location.search}`);
  return <Navigate to={destination.current} replace />;
}
