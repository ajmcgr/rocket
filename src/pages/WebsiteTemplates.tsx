import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { ArrowLeft, ExternalLink, Download, Loader2 } from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { Logotype } from "@/components/Logotype";
import { defaultLogotypeState, type LogotypeState } from "@/lib/logotype";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import ProjectNavigation from "@/components/ProjectNavigation";

const supabase = _sb as any;

type Template = {
  key: string;
  name: string;
  category: string;
  render: (ctx: RenderCtx) => JSX.Element;
};

type RenderCtx = {
  brandName: string;
  tagline: string;
  logo: LogotypeState;
  brandColor: string;
  accent: string;
};

// Simple readable-on-bg helper.
function textOn(bg: string): string {
  const hex = bg.replace("#", "");
  if (hex.length < 6) return "#0A0A0A";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  return y > 160 ? "#0A0A0A" : "#FFFFFF";
}

function LogoInline({ logo, color }: { logo: LogotypeState; color?: string }) {
  const state = color ? { ...logo, color } : logo;
  return (
    <div className="h-7 w-auto">
      <Logotype state={state} fit="contain" />
    </div>
  );
}

const TEMPLATES: Template[] = [
  {
    key: "saas-hero",
    name: "SaaS Landing",
    category: "Marketing",
    render: ({ brandName, tagline, logo, brandColor }) => (
      <div className="flex h-full flex-col bg-white text-neutral-900">
        <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-100">
          <LogoInline logo={logo} />
          <div className="flex items-center gap-4 text-[10px] text-neutral-600">
            <span>Product</span><span>Pricing</span><span>Docs</span>
            <span className="rounded-full px-2.5 py-1 text-white" style={{ backgroundColor: brandColor }}>Get started</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="text-[10px] font-medium normal-case tracking-widest" style={{ color: brandColor }}>Now in beta</div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">{tagline || `Ship ${brandName} faster.`}</h1>
          <p className="mt-2 max-w-md text-xs text-neutral-500">A modern platform to help teams build, launch, and grow — beautifully.</p>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full px-3 py-1.5 text-[11px] font-medium text-white" style={{ backgroundColor: brandColor }}>Start free</span>
            <span className="rounded-full border border-neutral-300 px-3 py-1.5 text-[11px] font-medium">See demo</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "dark-hero",
    name: "Dark Product",
    category: "Marketing",
    render: ({ brandName, tagline, logo, brandColor }) => (
      <div className="flex h-full flex-col bg-neutral-950 text-white">
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
          <LogoInline logo={logo} color="#FFFFFF" />
          <span className="rounded-full px-2.5 py-1 text-[10px]" style={{ backgroundColor: brandColor }}>Sign in</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-10">
          <div className="max-w-md">
            <div className="text-[10px] normal-case tracking-widest text-white/50">{brandName}</div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">{tagline || "The operating system for modern brands."}</h1>
            <p className="mt-2 text-xs text-white/60">Design, ship and evolve — all in one place.</p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-full px-3 py-1.5 text-[11px] font-medium" style={{ backgroundColor: brandColor }}>Try {brandName}</span>
              <span className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-medium">Watch video</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "waitlist",
    name: "Waitlist",
    category: "Launch",
    render: ({ brandName, logo, brandColor }) => (
      <div className="flex h-full flex-col items-center justify-center bg-neutral-50 px-10 text-center text-neutral-900">
        <div className="mb-6"><LogoInline logo={logo} /></div>
        <h1 className="text-2xl font-semibold">Join the {brandName} waitlist</h1>
        <p className="mt-2 max-w-sm text-xs text-neutral-500">Be the first to try it. Early members get lifetime perks.</p>
        <div className="mt-4 flex w-full max-w-sm items-center gap-2">
          <span className="flex-1 rounded-full border border-neutral-300 bg-white px-3 py-2 text-[11px] text-neutral-400">you@founder.com</span>
          <span className="rounded-full px-3 py-2 text-[11px] font-medium text-white" style={{ backgroundColor: brandColor }}>Join</span>
        </div>
      </div>
    ),
  },
  {
    key: "pricing",
    name: "Pricing Page",
    category: "Marketing",
    render: ({ brandName, logo, brandColor }) => (
      <div className="flex h-full flex-col bg-white text-neutral-900">
        <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-100">
          <LogoInline logo={logo} />
          <span className="rounded-full px-2.5 py-1 text-[10px] text-white" style={{ backgroundColor: brandColor }}>Get started</span>
        </div>
        <div className="flex-1 px-6 py-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Simple pricing</h1>
            <p className="mt-1 text-[11px] text-neutral-500">One plan, everything you need to launch {brandName}.</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { name: "Free", price: "$0" },
              { name: "Pro", price: "$19", highlight: true },
              { name: "Team", price: "$49" },
            ].map((p) => (
              <div key={p.name} className={`rounded-xl border p-3 text-center ${p.highlight ? "border-transparent text-white" : "border-neutral-200"}`} style={p.highlight ? { backgroundColor: brandColor } : {}}>
                <div className="text-[10px] font-medium normal-case tracking-wide opacity-80">{p.name}</div>
                <div className="mt-1 text-lg font-semibold">{p.price}</div>
                <div className="mt-1 text-[10px] opacity-70">per month</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "portfolio",
    name: "Portfolio",
    category: "Personal",
    render: ({ brandName, tagline, logo, brandColor }) => (
      <div className="flex h-full flex-col bg-[#faf7f2] text-neutral-900">
        <div className="flex items-center justify-between px-6 py-3">
          <LogoInline logo={logo} />
          <div className="flex items-center gap-4 text-[10px]">
            <span>Work</span><span>About</span><span>Contact</span>
          </div>
        </div>
        <div className="flex flex-1 items-center px-8">
          <div className="max-w-md">
            <div className="text-[10px] normal-case tracking-widest" style={{ color: brandColor }}>{brandName}</div>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">{tagline || "Independent design & strategy."}</h1>
            <p className="mt-2 text-xs text-neutral-500">Selected work with startups, studios and creators.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "app-store",
    name: "App Landing",
    category: "Product",
    render: ({ brandName, tagline, logo, brandColor }) => (
      <div className="flex h-full flex-col" style={{ backgroundColor: brandColor, color: textOn(brandColor) }}>
        <div className="flex items-center justify-between px-6 py-3">
          <LogoInline logo={logo} color={textOn(brandColor)} />
          <span className="rounded-full border border-current px-2.5 py-1 text-[10px]">Download</span>
        </div>
        <div className="flex flex-1 items-center justify-between gap-6 px-8">
          <div className="max-w-xs">
            <h1 className="text-2xl font-semibold leading-tight">{tagline || `${brandName}, in your pocket.`}</h1>
            <p className="mt-2 text-xs opacity-80">A beautifully simple app for daily use.</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-medium text-white">App Store</span>
              <span className="rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-medium text-white">Google Play</span>
            </div>
          </div>
          <div className="hidden h-40 w-24 rounded-2xl border border-current/40 sm:block" />
        </div>
      </div>
    ),
  },
];

export default function WebsiteTemplates() {
  const { id: projectId } = useParams();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [logoAsset, setLogoAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("All");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: assets }] = await Promise.all([
        supabase.from("projects").select("id,name,brand_color,tagline,description").eq("id", projectId).maybeSingle(),
        supabase
          .from("assets")
          .select("id,title,asset_type,editor_state,created_at")
          .eq("project_id", projectId)
          .in("asset_type", ["logo", "logotype", "wordmark"])
          .order("created_at", { ascending: true })
          .limit(20),
      ]);
      if (cancelled) return;
      setProject(proj || null);
      const withState = (assets || []).find((a: any) => a.editor_state?.kind === "logotype");
      setLogoAsset(withState || (assets || [])[0] || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const brandColor = useMemo(() => {
    const c = String(project?.brand_color || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#2563EB";
  }, [project]);

  const logo = useMemo<LogotypeState>(() => {
    if (logoAsset?.editor_state?.kind === "logotype") return logoAsset.editor_state as LogotypeState;
    return defaultLogotypeState(project?.name || "Brand");
  }, [logoAsset, project]);

  const ctx: RenderCtx = {
    brandName: project?.name || "Brand",
    tagline: project?.tagline || "",
    logo,
    brandColor,
    accent: brandColor,
  };

  const categories = ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];
  const filtered = category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        {projectId ? (
          <Link
            to={`/brands/${projectId}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-50"
            aria-label="Back to brand kit"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Website Templates</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Preview your brand applied to ready-to-ship page layouts.</p>
        </div>
      </div>

      {projectId ? (
        <div className="mb-6">
          <ProjectNavigation projectId={projectId} active="downloads" />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              category === c
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[16/10] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((t) => (
            <div
              key={t.key}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.15)]"
            >
              <div className="aspect-[16/10] w-full overflow-hidden">
                {t.render(ctx)}
              </div>
              <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-neutral-900">{t.name}</div>
                  <div className="text-[11px] text-neutral-500">{t.category}</div>
                </div>
                <button
                  onClick={() => toast({ title: "Coming soon", description: "Full-page export is on the roadmap." })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Use template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}