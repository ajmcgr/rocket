import { useState } from "react";
import { optimizedMediaUrl, type PublicAppMedia } from "@/lib/appMedia";

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
    <section className="mt-8" aria-labelledby="gallery-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="gallery-title" className="text-xl font-semibold tracking-tight">
            See {name} in action
          </h2>
        </div>
        <span className="text-xs text-neutral-500">
          Product media from Launch or the app owner
        </span>
      </div>
      {visible.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:thin]">
          {visible.map((item, index) => (
            <a
              key={item.id}
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative w-[min(82vw,34rem)] shrink-0 snap-start overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 focus-visible:outline-2 focus-visible:outline-sky-500"
            >
              <img
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
                className="h-64 w-full object-contain sm:h-80"
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
