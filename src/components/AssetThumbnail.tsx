import { useEffect, useState } from "react";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { isBrandKitLogotypeAsset, logotypeStateFromAsset } from "@/lib/brandLogoAsset";
import { createArtworkPreviewFromImageUrl, createCanvasElementsPreview, createLogotypePreview } from "@/lib/previewThumbnail";

type AssetThumbnailProps = {
  asset: any;
  alt?: string;
  className?: string;
  fallbackText?: string;
  background?: string | null;
  outputWidth?: number;
  outputHeight?: number;
  paddingRatio?: number;
  logoColor?: string;
  /** Use the stored thumbnail directly in dense library grids. */
  fast?: boolean;
};

export default function AssetThumbnail({
  asset,
  alt,
  className = "h-full w-full object-contain",
  fallbackText,
  background = null,
  outputWidth,
  outputHeight,
  paddingRatio,
  logoColor,
  fast = false,
}: AssetThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const previewKey = JSON.stringify({
    id: asset?.id,
    title: asset?.title,
    thumbnail_url: asset?.thumbnail_url,
    image_url: asset?.image_url,
    preview_url: asset?.preview_url || asset?.meta?.preview_url,
    background,
    outputWidth,
    outputHeight,
    paddingRatio,
    logoColor,
    editor_state: asset?.editor_state,
  });

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    void (async () => {
      try {
        // Grid cards must not download and scan full-resolution source images
        // just to make a preview. The browser can load the stored thumbnail
        // lazily and independently of the page's database request.
        const directUrl = asset?.preview_url || asset?.meta?.preview_url || asset?.thumbnail_url || asset?.image_url;
        if (fast && directUrl) {
          if (!cancelled) setSrc(directUrl);
          return;
        }
        const opts = { background, outputWidth, outputHeight, paddingRatio, logoColor, normalizeLogoLockup: asset?.meta?.kind === "logo_lockup" };
        const storedPreview = asset?.preview_url || asset?.meta?.preview_url;
        const hasEditableSource = isBrandKitLogotypeAsset(asset) || isCanvasAsset(asset);
        if (isBrandKitLogotypeAsset(asset)) {
          const state = logotypeStateFromAsset(asset, asset?.title || "Brand");
          const preview = await createLogotypePreview(state, opts);
          if (!cancelled) setSrc(preview);
          return;
        }
        if (isCanvasAsset(asset)) {
          const preview = await createCanvasElementsPreview(asset.editor_state, opts);
          if (!cancelled) setSrc(preview);
          return;
        }
        if (storedPreview && !hasEditableSource) {
          if (!cancelled) setSrc(storedPreview);
          return;
        }
        const url = asset?.thumbnail_url || asset?.image_url;
        if (url) {
          const preview = await createArtworkPreviewFromImageUrl(url, opts);
          if (!cancelled) setSrc(preview);
          return;
        }
        if (!cancelled) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewKey]);

  if (src) {
    return <img src={src} alt={alt || asset?.title || "Design preview"} className={className} loading="lazy" />;
  }

  if (failed) {
    const directUrl = asset?.preview_url || asset?.meta?.preview_url || asset?.thumbnail_url || asset?.image_url;
    if (directUrl) {
      return <img src={directUrl} alt={alt || asset?.title || "Design preview"} className={className} loading="lazy" />;
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-400">
      <span className="line-clamp-4 whitespace-pre-wrap">{fallbackText || asset?.title || asset?.asset_type || "Preview"}</span>
    </div>
  );
}
