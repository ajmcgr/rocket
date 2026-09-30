import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@/lib/router-compat";

const BrandIdRedirect = () => {
  const { id } = Route.useParams();
  return <Navigate to={id ? `/brands/${id}` : "/brands"} replace />;
};

export const Route = createFileRoute("/_app/brand/$id")({ component: BrandIdRedirect });
