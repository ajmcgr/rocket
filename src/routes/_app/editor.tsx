import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const Editor = lazy(() => import("@/pages/Editor"));

function EditorLoading() {
  return (
    <div
      role="status"
      aria-label="Loading Brand Studio"
      className="rocket-skeleton-surface min-h-[70vh] p-6"
    >
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-12 rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        <div className="grid grid-cols-[12rem_1fr] gap-4">
          <div className="h-[32rem] rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-[32rem] rounded-lg bg-neutral-100 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

export function EditorRoute() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Canvas modules must only be evaluated in the browser, after hydration.
  if (!hydrated) return <EditorLoading />;
  return (
    <Suspense fallback={<EditorLoading />}>
      <Editor />
    </Suspense>
  );
}

export const Route = createFileRoute("/_app/editor")({
  component: EditorRoute,
});
