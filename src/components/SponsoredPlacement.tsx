import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import AppLogo from "./AppLogo";

type Placement = {
  sponsorship_id: string;
  sponsorship_type: "featured_app" | "category_sponsor";
  category: string | null;
  app: { id: string; name: string; slug: string | null; tagline: string | null; logo_url: string | null };
};

/** Separate paid inventory; never mixed into editorial or ranked app arrays. */
export default function SponsoredPlacement({ category }: { category?: string }) {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const element = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let current = true;
    setPlacement(null);
    void supabase.functions.invoke("rocket-advertising", {
      body: { action: "active", category: category || null },
    }).then(({ data, error }) => {
      if (!current || error) return;
      const targetType = category ? "category_sponsor" : "featured_app";
      setPlacement((data?.placements || []).find((item: Placement) => item.sponsorship_type === targetType) || null);
    });
    return () => { current = false; };
  }, [category]);
  useEffect(() => {
    if (!placement || !element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      track("sponsored_impression", { sponsorship_id: placement.sponsorship_id, app_id: placement.app.id });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [placement]);
  if (!placement) return null;
  const href = `/apps/${placement.app.slug || placement.app.id}?sponsor=${placement.sponsorship_id}`;
  return <section ref={element} className="mt-8 rounded-2xl border border-sky-200 bg-white p-5 sm:p-6" aria-label={category ? `Sponsored in ${category}` : "Sponsored app"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800">Sponsored</span>
      <span className="text-xs text-neutral-500">Paid placement · organic rankings are separate</span>
    </div>
    <div className="mt-4 flex items-center gap-4">
      <AppLogo name={placement.app.name} src={placement.app.logo_url} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">{placement.app.name}</h2>
        {placement.app.tagline && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{placement.app.tagline}</p>}
        {category && <p className="mt-1 text-xs text-neutral-500">{category}</p>}
      </div>
      <Link to={href} onClick={() => track("sponsored_click", { sponsorship_id: placement.sponsorship_id, app_id: placement.app.id })}
        className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-sky-600 px-4 text-sm font-semibold text-sky-700 hover:bg-sky-50">View app</Link>
    </div>
  </section>;
}
