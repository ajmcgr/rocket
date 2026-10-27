import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { optimizedMediaUrl, type PublicAppMedia } from "@/lib/appMedia";
import {
  orderedScreenshots,
  screenshotLayout,
  screenshotPage,
  SCREENSHOTS_PER_GALLERY,
} from "@/lib/screenshotGallery";
import AppScreenshot from "./AppScreenshot";
import "./ScreenshotGallery.css";

export default function AppMediaGallery({
  name,
  media,
}: {
  name: string;
  media: PublicAppMedia[];
}) {
  const images = orderedScreenshots(media);
  const videos = media.filter((item) => item.media_type === "video");
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [activePage, setActivePage] = useState(0);
  const visible = images.filter((item) => !failed.has(item.id));
  const pageCount = Math.ceil(visible.length / SCREENSHOTS_PER_GALLERY);
  const currentPage = Math.min(activePage, Math.max(pageCount - 1, 0));
  const pageImages = screenshotPage(visible, currentPage);
  if (!visible.length && !videos.length) return null;
  return (
    <section className="mt-6" aria-label={`${name} media`}>
      {visible.length > 0 && (
        <div className="relative">
          {pageCount > 1 && (
            <div className="mb-3 flex items-center justify-end gap-2">
              <span
                className="mr-2 text-sm text-neutral-500 dark:text-neutral-400"
                aria-live="polite"
              >
                {currentPage * SCREENSHOTS_PER_GALLERY + 1}–
                {currentPage * SCREENSHOTS_PER_GALLERY + pageImages.length} /{" "}
                {visible.length}
              </span>
              <button
                type="button"
                aria-label="Previous screenshot"
                disabled={currentPage === 0}
                onClick={() => setActivePage(currentPage - 1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next screenshot"
                disabled={currentPage === pageCount - 1}
                onClick={() => setActivePage(currentPage + 1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition hover:border-sky-400 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          )}
          <div
            className="rocket-screenshot-grid rocket-public-screenshot-grid"
            data-layout={screenshotLayout(pageImages.length)}
          >
            {pageImages.map((item, index) => (
              <a
                key={item.id}
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-sky-500 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <AppScreenshot
                  src={
                    original.has(item.id)
                      ? item.source_url
                      : optimizedMediaUrl(item.source_url, 1200, 800, "contain")
                  }
                  alt={`${name} product image ${currentPage * SCREENSHOTS_PER_GALLERY + index + 1}`}
                  loading="lazy"
                  decoding="async"
                  onError={() =>
                    original.has(item.id)
                      ? setFailed((current) => new Set(current).add(item.id))
                      : setOriginal((current) => new Set(current).add(item.id))
                  }
                />
                <span className="absolute bottom-3 right-3 rounded-full bg-white/90 p-2 text-neutral-800 opacity-0 transition group-hover:opacity-100">
                  <span aria-hidden="true">→</span>
                </span>
              </a>
            ))}
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
