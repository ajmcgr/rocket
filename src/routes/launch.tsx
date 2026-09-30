import { createFileRoute } from "@tanstack/react-router";
import { Navigate, useLocation } from "@/lib/router-compat";

function LegacyLaunchRedirect() {
  const { search } = useLocation();
  const appId = new URLSearchParams(search).get("app");
  return <Navigate to={appId ? `/apps/add?app=${encodeURIComponent(appId)}` : "/submit"} replace />;
}

export const Route = createFileRoute("/launch")({
  component: LegacyLaunchRedirect,
});
