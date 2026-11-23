import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/valuation")({
  beforeLoad: () => { throw redirect({ to: "/sellmyapp", statusCode: 301, replace: true }); },
});
