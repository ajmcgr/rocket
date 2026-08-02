import { useEffect, useSyncExternalStore } from "react";
import type { BlogPost } from "@/content/blogMeta";
import { ensureBlogImages, getBlogImage, subscribeBlogImages, type BlogImage } from "@/lib/blogImages";

/** Subscribe to generated artwork for a single post. */
export function useBlogImage(slug: string): BlogImage | null {
  return useSyncExternalStore(
    subscribeBlogImages,
    () => getBlogImage(slug),
    () => null,
  );
}

/** Load the artwork index and kick off generation for anything missing. */
export function useEnsureBlogImages(scope?: BlogPost[]) {
  useEffect(() => {
    void ensureBlogImages(scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.map((post) => post.slug).join(",")]);
}
