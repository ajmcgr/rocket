import { supabase } from "@/integrations/supabase/client";
import { posts, type BlogPost } from "@/content/blogMeta";

/**
 * Client-side store for Gemini-generated blog artwork.
 *
 * Images live in Supabase Storage and are indexed in `public.blog_images`.
 * The store loads the index once, then quietly asks the `blog-image` edge
 * function to generate artwork for any published post that doesn't have any
 * yet — so newly published articles (and the existing backlog) get covers with
 * zero manual work. Rendering never depends on it: `ArticleCover` falls back to
 * the deterministic branded gradient while artwork is missing or generating.
 */

export type BlogImage = {
  slug: string;
  hero_url: string;
  card_url: string;
  og_url: string;
};

const cache = new Map<string, BlogImage>();
const listeners = new Set<() => void>();
const requested = new Set<string>();

let loaded = false;
let loading: Promise<void> | null = null;
let queueRunning = false;

const emit = () => listeners.forEach((listener) => listener());

export const subscribeBlogImages = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getBlogImage = (slug: string): BlogImage | null => cache.get(slug) || null;

async function loadIndex(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    const { data, error } = await supabase
      .from("blog_images" as never)
      .select("slug, hero_url, card_url, og_url");
    if (!error && data) {
      for (const row of data as unknown as BlogImage[]) cache.set(row.slug, row);
    }
    loaded = true;
    emit();
  })();
  return loading;
}

async function generate(post: BlogPost): Promise<void> {
  const { data, error } = await supabase.functions.invoke("blog-image", {
    body: {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body.slice(0, 12000),
      category: post.category,
      tags: post.tags,
      date: post.date,
    },
  });
  if (error) throw error;
  const image = (data as { image?: BlogImage } | null)?.image;
  if (image?.card_url) {
    cache.set(image.slug, image);
    emit();
  }
}

/** Generate missing artwork one post at a time so we never hammer Gemini. */
async function runQueue(candidates: BlogPost[]): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  try {
    for (const post of candidates) {
      if (cache.has(post.slug)) continue;
      try {
        await generate(post);
      } catch (error) {
        console.warn(`[blog-image] ${post.slug} failed`, error);
      }
    }
  } finally {
    queueRunning = false;
  }
}

/**
 * Ensure artwork exists for the given posts (defaults to the most recent ones).
 * Safe to call on every render — work is de-duplicated.
 */
export async function ensureBlogImages(scope: BlogPost[] = posts.slice(0, 12)) {
  await loadIndex();
  const missing = scope.filter((post) => !cache.has(post.slug) && !requested.has(post.slug));
  if (!missing.length) return;
  missing.forEach((post) => requested.add(post.slug));
  void runQueue(missing);
}

/** One-time backfill for the entire archive. */
export async function backfillBlogImages() {
  await ensureBlogImages(posts);
}
