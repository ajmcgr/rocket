import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sellmyapp")({
  beforeLoad: () => { throw redirect({ to: "/sell", statusCode: 301, replace: true }); },
});
