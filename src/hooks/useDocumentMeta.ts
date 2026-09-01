import { useEffect } from "react";

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([k, v]) => { if (k !== "content") el!.setAttribute(k, v); });
    document.head.appendChild(el);
  }
  if (attrs.content) el.setAttribute("content", attrs.content);
}

export function useDocumentMeta(opts: { title?: string; description?: string; image?: string | null; canonical?: string }) {
  useEffect(() => {
    const prevTitle = document.title;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.href;
    const createdCanonical = !canonical;
    if (opts.title) document.title = opts.title;
    if (opts.canonical) {
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = opts.canonical;
    }
    if (opts.description) {
      upsertMeta('meta[name="description"]', { name: "description", content: opts.description });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: opts.description });
      upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: opts.description });
    }
    if (opts.title) {
      upsertMeta('meta[property="og:title"]', { property: "og:title", content: opts.title });
      upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: opts.title });
    }
    if (opts.image) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: opts.image });
      upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: opts.image });
      upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    }
    return () => {
      document.title = prevTitle;
      if (canonical && createdCanonical) canonical.remove();
      else if (canonical && previousCanonical) canonical.href = previousCanonical;
    };
  }, [opts.title, opts.description, opts.image, opts.canonical]);
}
