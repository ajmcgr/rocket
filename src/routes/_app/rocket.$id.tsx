import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

const AssetRouteRedirect = () => {
  const { id } = Route.useParams();
  return <Navigate to={id ? `/editor?id=${id}` : "/designs"} replace />;
};

export const Route = createFileRoute("/_app/rocket/$id")({ component: AssetRouteRedirect });
