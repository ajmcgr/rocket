import type { PublicAppMedia } from "./appMedia";

export const SCREENSHOTS_PER_GALLERY = 4;

export function orderedScreenshots(media: PublicAppMedia[]): PublicAppMedia[] {
  return media
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
}

export function screenshotPage<T>(images: T[], page = 0): T[] {
  return images.slice(
    page * SCREENSHOTS_PER_GALLERY,
    (page + 1) * SCREENSHOTS_PER_GALLERY,
  );
}

export function screenshotLayout(
  count: number,
): "single" | "pair" | "triple" | "quad" {
  return count <= 1
    ? "single"
    : count === 2
      ? "pair"
      : count === 3
        ? "triple"
        : "quad";
}
