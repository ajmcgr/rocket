import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/rankings")({
  beforeLoad: () => {
    throw redirect({
      to: "/discover",
      search: { view: "rankings" },
      replace: true,
    });
  },
});
