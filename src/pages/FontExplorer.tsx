import { useEffect, useState } from "react";
import { useParams } from "@/lib/router-compat";
import { supabase as _sb } from "@/integrations/supabase/client";
import { loadGoogleFont } from "@/lib/logotype";
import { Skeleton } from "@/components/ui/skeleton";
import { loadBrandMeta } from "@/lib/brandMeta";

const supabase = _sb as any;

function fontFromState(state: any): string | null {
  if (!state) return null;
  if (state.kind === "logotype" && typeof state.font === "string" && state.font.trim()) {
    return state.font.trim();
  }
  if (Array.isArray(state)) {
    for (const el of state) {
      if (el && typeof el === "object" && (el as any).kind === "text") {
        const fam = (el as any).fontFamily;
        if (typeof fam === "string" && fam.trim()) return fam.trim();
      }
    }
  }
  return null;
}

export default function FontExplorer() {
  const { id: projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: assets } = await supabase
        .from("assets")
        .select("id,editor_state,meta,updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      // Only show the font in use on the most recently saved brand-kit asset.
      let current: string | null = null;
      for (const a of assets || []) {
        if (!a?.meta?.saved_at) continue;
        const f = fontFromState(a.editor_state);
        if (f) { current = f; break; }
      }
      if (!current) {
        const meta = loadBrandMeta(projectId);
        if (meta.font) current = meta.font;
      }
      const list = current ? [current] : [];
      list.forEach((f) => loadGoogleFont(f, [400, 500, 600, 700]));
      setFonts(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const empty = !loading && fonts.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Fonts</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Typefaces used by the logos and icons in this brand kit.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[16/9] w-full rounded-2xl" />
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          No fonts yet. Save a logo or icon to your brand kit to populate the typography.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {fonts.map((family) => (
            <div
              key={family}
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]"
            >
              <div className="flex aspect-[16/9] items-center justify-center bg-white px-8">
                <div
                  className="truncate text-5xl text-neutral-900"
                  style={{ fontFamily: `'${family}', system-ui, sans-serif`, fontWeight: 600 }}
                >
                  Aa Bb Cc
                </div>
              </div>
              <div className="border-t border-neutral-100 px-4 py-3">
                <div className="truncate text-sm font-medium text-neutral-900">{family}</div>
                <div
                  className="mt-1 truncate text-neutral-700"
                  style={{ fontFamily: `'${family}', system-ui, sans-serif` }}
                >
                  The quick brown fox jumps over the lazy dog
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}