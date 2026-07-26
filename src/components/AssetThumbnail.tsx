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
};

export default function AssetThumbnail({
  asset,
  alt,
  className = "h-full w-full object-contain",
  fallbackText,
  background = null,
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
    editor_state: asset?.editor_state,
  });

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    void (async () => {
      try {
        const opts = { background };
        const storedPreview = asset?.preview_url || asset?.meta?.preview_url;
        if (storedPreview) {
          if (!cancelled) setSrc(storedPreview);
          return;
        }
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