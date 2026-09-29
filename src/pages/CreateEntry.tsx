import { Navigate, useSearchParams } from "react-router-dom";
import Generate from "./Generate";
import CreateHub from "./CreateHub";

/**
 * Preserve historical parameterized generation routes while providing a clean
 * entry point for people opening Create from Rocket's primary navigation.
 */
const CreateEntry = () => {
  const [params] = useSearchParams();
  const hasGenerationIntent =
    params.get("prompt") ||
    params.get("chat");

  if (hasGenerationIntent) return <Generate />;
  if (params.toString()) return <Navigate to={params.get("asset_type") === "icon" ? "/icons" : "/logos"} replace />;
  return <CreateHub />;
};

export default CreateEntry;
