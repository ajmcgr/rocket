import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const visible = images.filter((item) => !failed.has(item.id)).slice(0, 12);
  const currentIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0));
  const goTo = (index: number) => {
    const nextIndex = Math.max(0, Math.min(index, visible.length - 1));
    setActiveIndex(nextIndex);
    const track = trackRef.current;
    const item = track?.querySelectorAll(":scope > a")[nextIndex] as
      HTMLElement | undefined;
    if (track && item && typeof track.scrollTo === "function") {
      track.scrollTo({
        left:
          item.getBoundingClientRect().left -
          track.getBoundingClientRect().left +
          track.scrollLeft,
        behavior: "smooth",
      });
    }
  };
  if (!visible.length && !videos.length) return null;
  return (
    <section className="mt-6" aria-label={`${name} media`}>
      {visible.length > 0 && (
        <div className="relative">
          {visible.length > 1 && (
            <div className="mb-3 flex items-center justify-end gap-2">
              <span
                className="mr-2 text-sm text-neutral-500 dark:text-neutral-400"
                aria-live="polite"
              >
                {currentIndex + 1} / {visible.length}
              </span>
              <button
                type="button"
                aria-label="Previous screenshot"
                disabled={currentIndex === 0}
                onClick={() => goTo(currentIndex - 1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next screenshot"
                disabled={currentIndex === visible.length - 1}
                onClick={() => goTo(currentIndex + 1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          )}
          <div
            ref={trackRef}
            onScroll={(event) => {
              const track = event.currentTarget;
              const positions = Array.from(
                track.querySelectorAll(":scope > a"),
                (child) =>
                  Math.abs(
                    (child as HTMLElement).getBoundingClientRect().left -
                      track.getBoundingClientRect().left,
                  ),
              );
              if (positions.length)
                setActiveIndex(positions.indexOf(Math.min(...positions)));
            }}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]"
          >
            {visible.map((item, index) => (
              <a
                key={item.id}
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative aspect-video shrink-0 snap-start overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-neutral-700 dark:bg-neutral-900 ${visible.length === 1 ? "w-full" : "w-[88%] sm:w-[72%]"}`}
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
            {visible.length > 1 && (
              <div aria-hidden="true" className="w-[12%] shrink-0 sm:w-[28%]" />
            )}
          </div>
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
