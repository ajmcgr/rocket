import { createFileRoute, redirect } from "@tanstack/react-router";
import Discover from "@/pages/Discover";

export const Route = createFileRoute("/discover")({
  beforeLoad: ({ location }) => {
    if (new URLSearchParams(location.searchStr).get("view") === "rising") {
      throw redirect({ to: "/rising", search: { page: 0 }, replace: true });
    }
  },
  component: Discover,
});
