import { useState } from "react";
import { optimizedMediaUrl, type PublicAppMedia } from "@/lib/appMedia";
import AppScreenshot from "./AppScreenshot";

export default function AppMediaGallery({
  name,
  media,
}: {
  name: string;
  media: PublicAppMedia[];
}) {
  const images = media
    .filter(
      (item) =>
        item.media_type === "screenshot" || item.media_type === "thumbnail",
    )
    .sort(
      (left, right) =>
        Number(right.source_type === "owner") -
          Number(left.source_type === "owner") ||
        left.sort_order - right.sort_order,
    );
  const videos = media.filter((item) => item.media_type === "video");
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const visible = images.filter((item) => !failed.has(item.id)).slice(0, 12);
  if (!visible.length && !videos.length) return null;
  return (
    <section className="mt-6" aria-label={`${name} media`}>
      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((item, index) => (
            <a
              key={item.id}
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-video min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <AppScreenshot
                src={
                  original.has(item.id)
                    ? item.source_url
                    : optimizedMediaUrl(item.source_url, 1200, 800, "contain")
                }
                alt={`${name} product image ${index + 1}`}
                loading="lazy"
                decoding="async"
                onError={() =>
                  original.has(item.id)
                    ? setFailed((current) => new Set(current).add(item.id))
                    : setOriginal((current) => new Set(current).add(item.id))
                }
                className="h-full w-full"
              />
              <span className="absolute bottom-3 right-3 rounded-full bg-white/90 p-2 text-neutral-800 opacity-0 transition group-hover:opacity-100">
                <span aria-hidden="true">→</span>
              </span>
            </a>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {videos.map((item, index) => (
            <a
              key={item.id}
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium hover:border-sky-300"
            >
              Watch product video {index + 1}
              <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
