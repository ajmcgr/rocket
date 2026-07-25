import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { supabase as _sb } from "@/integrations/supabase/client";
import {
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Star,
  Shuffle,
} from "lucide-react";
import { AssetGridSkeleton } from "@/components/Skeletons";
import { Logotype } from "@/components/Logotype";
import CanvasAssetPreview from "@/components/CanvasAssetPreview";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { CollectionView, DesignSort, sortByOption } from "@/lib/designCollections";
import { matchesDesignQuery, rankDesignsByRelevance } from "@/lib/searchRelevance";
import { SEED_TEMPLATES } from "@/lib/seedTemplates";

const supabase = _sb as any;

const TEMPLATE_STYLES = [
  "Modern", "Minimal", "Luxury", "Technology", "Startup", "AI", "Consumer", "Enterprise", "Fintech", "Healthcare", "Education",
] as const;

type TemplateStyle = "all" | typeof TEMPLATE_STYLES[number];

const matchesTemplateStyle = (design: any, style: TemplateStyle) => {
  if (style === "all") return true;
  const declaredStyle = String(
    design?.meta?.template_style || design?.meta?.templateStyle || design?.meta?.style || "",
  ).toLowerCase();
  const searchable = [design?.title, design?.prompt, design?.content, declaredStyle]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const terms: Record<Exclude<TemplateStyle, "all">, string[]> = {
    Modern: ["modern", "contemporary"],
    Minimal: ["minimal", "clean", "simple"],
    Luxury: ["luxury", "premium", "elegant"],
    Technology: ["technology", "tech", "software", "digital"],
    Startup: ["startup", "saas", "founder"],
    AI: [" ai", "artificial intelligence", "machine learning"],
    Consumer: ["consumer", "retail", "lifestyle", "food", "beauty"],
    Enterprise: ["enterprise", "b2b", "business"],
    Fintech: ["fintech", "finance", "bank", "payment"],
    Healthcare: ["healthcare", "health", "medical", "wellness"],
    Education: ["education", "learning", "school", "academy"],
  };
  return terms[style].some((term) => searchable.includes(term));
};

const Templates = () => {
  const [designs, setDesigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TemplateStyle>("all");
  const [view, setView] = useState<CollectionView>("card");
  const [sort, setSort] = useState<DesignSort>("date");
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => { setVisibleCount(60); }, [filter, query, view, sort]);

  const templateCreateHref = (design: any) => {
    const designType = String(design?.asset_type || "logo");
    const prompt = `Create a distinctive ${designType.replace(/_/g, " ")} inspired by the ${design?.title || "selected"} template. Adapt it for my brand without reusing its name or content.`;
    return `/create?${new URLSearchParams({ asset_type: designType, prompt }).toString()}`;
  };

  const openTemplateInEditor = async (design: any, event?: React.MouseEvent) => {
    event?.preventDefault();
    // Non-seed designs already have a real row — open directly.
    if (!design?._seed) {
      window.open(`/editor?id=${design.id}`, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        toast({ title: "Sign in to use templates", variant: "destructive" });
        return;
      }
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      const workspace_id = await ensureActiveWorkspaceId();
      const { data, error } = await supabase.from("assets").insert({
        user_id: user.id,
        workspace_id,
        asset_type: design.asset_type || "logo",
        title: design.title || "Template",
        editor_state: design.editor_state,
        meta: {
          ...(design.meta || {}),
          from_template: true,
          kind: Array.isArray(design.editor_state) ? "canvas" : "logotype",
        },
      } as any).select("id").single();
      if (error || !data?.id) throw error || new Error("Couldn't open template");
      window.open(`/editor?id=${data.id}`, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({ title: "Couldn't open template", description: err?.message, variant: "destructive" });
    }
  };

  const saveTemplateToSaved = async (design: any, event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        toast({ title: "Sign in to save templates", variant: "destructive" });
        return;
      }
      if (!design?._seed && design?.id) {
        // Real asset — check if it already belongs to this user.
        const { data: existing } = await supabase
          .from("assets")
          .select("id,meta")
          .eq("id", design.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (existing?.id) {
          await supabase.from("assets").update({
            meta: { ...(existing.meta || {}), saved_at: new Date().toISOString(), saved_from_template: true },
          }).eq("id", existing.id);
          toast({ title: "Saved", description: "Added to Saved." });
          window.dispatchEvent(new CustomEvent("rocket:notify", { detail: { kind: "asset", title: "Template saved", body: design.title || "Added to Saved.", href: "/saved" }}));
          return;
        }
      }
      // Otherwise clone the template into the user's assets.
      const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
      const workspace_id = await ensureActiveWorkspaceId();
      const { error } = await supabase.from("assets").insert({
        user_id: user.id,
        workspace_id,
        asset_type: design.asset_type || "logo",
        title: design.title || "Template",
        editor_state: design.editor_state,
        image_url: design.image_url || null,
        thumbnail_url: design.thumbnail_url || null,
        meta: {
          ...(design.meta || {}),
          from_template: true,
          saved_from_template: true,
          saved_at: new Date().toISOString(),
          kind: design.editor_state?.kind || (design.image_url ? undefined : "logotype"),
        },
      } as any);
      if (error) throw error;
      toast({ title: "Saved", description: "Added to Saved." });
      window.dispatchEvent(new CustomEvent("rocket:notify", { detail: { kind: "asset", title: "Template saved", body: design.title || "Added to Saved.", href: "/saved" }}));
    } catch (err: any) {
      toast({ title: "Could not save", description: err?.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [{ data, error }, { data: auth }] = await Promise.all([
        supabase.rpc("get_public_designs", { _limit: 240 }),
        supabase.auth.getUser(),
      ]);
      // The RPC filters by share_token, but "Make public" in /saved sets
      // meta.public and only mints share_token on newer rows. Include the
      // current user's meta.public assets so they always show up here too.
      let ownPublic: any[] = [];
      if (auth?.user) {
        const { data: ownRows } = await supabase
          .from("assets")
          .select("id,user_id,title,asset_type,content,image_url,thumbnail_url,prompt,editor_state,meta,created_at,updated_at,share_token")
          .eq("user_id", auth.user.id)
          .is("deleted_at", null)
          .eq("meta->>public", "true")
          .order("created_at", { ascending: false })
          .limit(240);
        ownPublic = ownRows || [];
      }

      if (!cancelled) {
        if (error) {
          console.error(error);
          setDesigns([...SEED_TEMPLATES, ...ownPublic]);
        } else {
          // Prefer the curated seed catalog over any stale public rows that were
          // generated from older template logic; those rows can render as blank
          // blocks and duplicate the same names.
          const seedTitles = new Set(SEED_TEMPLATES.map((template: any) => String(template.title || "").toLowerCase()));
          const merged = [...(data || []), ...ownPublic];
          const seen = new Set<string>();
          const publicDesigns = merged.filter((design: any) => {
            if (design?.id && seen.has(design.id)) return false;
            if (design?.id) seen.add(design.id);
            const title = String(design?.title || "").toLowerCase();
            const isOldRocketSeed = seedTitles.has(title) || design?.meta?.seed === true;
            return !isOldRocketSeed;
          });
          setDesigns([...SEED_TEMPLATES, ...publicDesigns]);
        }
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    const visible = designs.filter((design) => {
      if (!matchesTemplateStyle(design, filter)) return false;
      return matchesDesignQuery(design, q);
    });

    return q
      ? rankDesignsByRelevance(visible, q)
      : sortByOption(visible, sort, (design) => design.title, (design) => design.created_at);
  }, [designs, filter, query, sort]);

  const visibleItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = filtered.length > visibleItems.length;

  const DesignPreview = ({ design }: { design: any }) => {
    const isLogotype = design?.editor_state?.kind === "logotype";
    const isCanvas = isCanvasAsset(design);
    const seedImage = design?._seed && (design.thumbnail_url || design.image_url);
    // Prefer live editor_state over the seed image so edits from /editor
    // propagate to preview cards, but seed templates should use their finished
    // SVG previews; rendering their editable canvas state can show only blocks
    // while nested data-URL images/fonts are loading.
    const isImage = (seedImage || design.image_url) && !isLogotype && (!isCanvas || seedImage);

    return (
      <div className="h-full w-full" style={{ background: design?.background || undefined }}>
        {isImage ? (
          <img
            src={design.thumbnail_url || design.image_url}
            alt={design.title}
            className={`h-full w-full ${seedImage ? "object-contain" : "object-cover"}`}
            loading="lazy"
          />
        ) : isLogotype ? (
          <Logotype state={design.editor_state} fit="contain" />
        ) : isCanvas ? (
          <CanvasAssetPreview elements={design.editor_state} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-neutral-500">
            <div className="line-clamp-6 whitespace-pre-wrap">{(design.content || design.prompt || "").slice(0, 220)}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-neutral-500">Start with a public creative direction, then make it your own.</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            className="h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-neutral-400 sm:w-72"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1 text-xs transition ${filter === "all" ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</button>
          {TEMPLATE_STYLES.map((style) => (
            <button key={style} onClick={() => setFilter(style)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === style ? "border-brand bg-brand text-brand-foreground" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {style}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setView("card")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "card" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Card
            </button>
            <button onClick={() => setView("list")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${view === "list" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>

          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-1">
            <button onClick={() => setSort("name")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "name" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              <ArrowUpDown className="h-3.5 w-3.5" /> Name (A–Z)
            </button>
            <button onClick={() => setSort("date")} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${sort === "date" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
              Date created
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <AssetGridSkeleton />
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-3xl border border-dashed border-neutral-300 bg-gradient-to-b from-white to-neutral-50 p-16 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">No templates yet.</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            Public designs will appear here once people share them.
          </p>
        </div>
      ) : view === "card" ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((design) => (
            <div
              key={design.id}
              onClick={() => void openTemplateInEditor(design)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md"
            >
              <div className="aspect-square w-full overflow-hidden bg-neutral-50">
                <DesignPreview design={design} />
              </div>
              <div className="border-t border-neutral-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900">{design.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">by {design.creator_username || "Rocket creator"}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-neutral-500">{(design.asset_type || "Design").replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-[10px] text-neutral-400">{new Date(design.created_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); void saveTemplateToSaved(design, e); }} title="Save to Saved" className="inline-flex items-center justify-center rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                    <Star className={`h-3.5 w-3.5 ${design?.meta?.saved_at ? "fill-amber-400 text-amber-400" : ""}`} />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); void openTemplateInEditor(design, e); }} title="Remix" className="inline-flex items-center justify-center rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                    <Shuffle className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {visibleItems.map((design) => (
            <div
              key={design.id}
              onClick={() => void openTemplateInEditor(design)}
              className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-4 py-3 transition hover:bg-neutral-50 last:border-b-0"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-50">
                <DesignPreview design={design} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">{design.title}</div>
                <div className="truncate text-xs text-neutral-500">
                  {(design.asset_type || "Design").replace(/_/g, " ")} · by {design.creator_username || "Rocket creator"}
                </div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); void saveTemplateToSaved(design, e); }} title="Save to Saved" className="shrink-0 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                <Star className={`h-3.5 w-3.5 ${design?.meta?.saved_at ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>
              <div className="shrink-0 text-xs text-neutral-400">{new Date(design.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
      {!loading && hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + 60)}
            className="rounded-full border border-neutral-200 bg-white px-5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Load more ({filtered.length - visibleItems.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
};

export default Templates;
