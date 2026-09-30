import { lazy, Suspense, useEffect, useState } from "react";
import { type CanvasElement } from "@/lib/canvasAsset";

// react-konva cannot be evaluated during SSR (it touches React internals and
// the DOM at module scope), so the real implementation is loaded lazily and
// only rendered after hydration.
const CanvasAssetPreviewImpl = lazy(() => import("@/components/CanvasAssetPreviewImpl"));

export default function CanvasAssetPreview(props: {
  elements: CanvasElement[];
  className?: string;
  background?: string;
  logoColor?: string;
  keyOutImages?: boolean;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return <div className={props.className} />;
  return (
    <Suspense fallback={<div className={props.className} />}>
      <CanvasAssetPreviewImpl {...props} />
    </Suspense>
  );
}
