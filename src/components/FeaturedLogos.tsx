import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ICON_SEED_TEMPLATES, getIconOnlyDataUrl } from "@/lib/seedIconTemplates";
import designduelRegular from "@/assets/featured/designduel-regular.png.asset.json";
import designduelInverse from "@/assets/featured/designduel-inverse.png.asset.json";

// Curated portfolio: real user favorites first, then a refreshed mix of
// icon-only marks and full logotypes spanning styles and colour moods.
const FEATURED: { name: string; iconOnly?: boolean }[] = [
  { name: "Astra AI" },
  { name: "Vertex", iconOnly: true },
  { name: "Grove Bank" },
  { name: "Cocoon", iconOnly: true },
  { name: "ATELIER" },
  { name: "Pulsecraft", iconOnly: true },
  { name: "Salt & Sage" },
  { name: "GLYPH", iconOnly: true },
  { name: "House of Ember" },
  { name: "Skyline OS", iconOnly: true },
  { name: "Parable" },
  { name: "Halcyon Modern", iconOnly: true },
];

// Real customer-uploaded marks pinned to the front of the carousel.
const PINNED = [
  {
    id: "pinned-designduel-inverse",
    title: "designduel",
    asset_type: "logo",
    image_url: designduelInverse.url,
    background: "#E5E7EB",
    prompt: "designduel",
    creator_username: "Rocket Studio",
    created_at: new Date().toISOString(),
    meta: { template_style: "Lockup", seed: true },
    editor_state: null,
    _seed: true as const,
  },
  {
    id: "pinned-designduel-regular",
    title: "designduel mark",
    asset_type: "logo",
    image_url: designduelRegular.url,
    background: "#FFFFFF",
    prompt: "designduel mark",
    creator_username: "Rocket Studio",
    created_at: new Date().toISOString(),
    meta: { template_style: "Icon", seed: true },
    editor_state: null,
    _seed: true as const,
  },
];

// Pure wordmark / logotype examples with no icon mark.
const LOGOTYPE_SEEDS = [
  { name: "Ligature", font: "Playfair Display", weight: 700, color: "#0F172A", bg: "#FAFAF9" },
  { name: "Monument", font: "Space Grotesk", weight: 800, transform: "uppercase", letterSpacing: 0.08, color: "#111827", bg: "#FFFFFF" },
  { name: "Northbound", font: "Inter", weight: 600, color: "#0C4A6E", bg: "#E0F2FE" },
  { name: "Studio Mono", font: "IBM Plex Mono", weight: 700, color: "#F8FAFC", bg: "#0F172A" },
  { name: "Serif & Co", font: "Crimson Pro", weight: 600, color: "#7F1D1D", bg: "#FFF1F2" },
];

function logotypeDataUrl(seed: typeof LOGOTYPE_SEEDS[number]): string {
  const W = 800, H = 600;
  const text = seed.transform === "uppercase" ? seed.name.toUpperCase() : seed.name;
  const ls = ((seed.letterSpacing ?? 0) * 64).toFixed(2);
  const family = `${seed.font}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${seed.bg}"/>
    <text x="${W / 2}" y="${H / 2 + 12}" fill="${seed.color}" text-anchor="middle" font-family='${family}' font-weight="${seed.weight}" font-size="72" letter-spacing="${ls}">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function FeaturedLogos() {
  const iconPicks = FEATURED
    .map((f) => {
      const tpl = ICON_SEED_TEMPLATES.find((t) => t.title === f.name);
      if (!tpl) return null;
      const image_url = f.iconOnly ? getIconOnlyDataUrl(f.name) || tpl.image_url : tpl.image_url;
      return { ...tpl, image_url };
    })
    .filter(Boolean);

  const logotypePicks = LOGOTYPE_SEEDS.map((seed, i) => ({
    id: `seed-logotype-${i}`,
    title: seed.name,
    asset_type: "logo",
    image_url: logotypeDataUrl(seed),
    background: seed.bg,
    prompt: seed.name,
    creator_username: "Rocket Studio",
    created_at: new Date(Date.now() - (FEATURED.length + i) * 3600_000).toISOString(),
    meta: { template_style: "Logotype", seed: true },
    editor_state: null,
    _seed: true as const,
  }));

  const picks = [...PINNED, ...iconPicks, ...logotypePicks] as typeof ICON_SEED_TEMPLATES;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="border-t border-neutral-200/60 bg-neutral-50/60">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-medium tracking-tight sm:text-5xl">Logos made with Rocket</h2>
          <p className="mt-4 text-lg text-neutral-600">
            A shortlist of our favourite marks — every one of them started as a single prompt.
          </p>
        </div>

        <div className="relative mt-16">
          <button
            type="button"
            aria-label="Previous logos"
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-3 shadow-md transition hover:bg-neutral-50"
          >
            <ChevronLeft className="h-5 w-5 text-neutral-700" />
          </button>
          <button
            type="button"
            aria-label="Next logos"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 z-10 translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-3 shadow-md transition hover:bg-neutral-50"
          >
            <ChevronRight className="h-5 w-5 text-neutral-700" />
          </button>
          <div
            ref={scrollerRef}
            className="-mx-6 flex snap-x snap-mandatory gap-10 overflow-x-auto scroll-smooth px-6 pb-2 sm:gap-14 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {picks.map((tpl) => (
              <Link
                key={tpl.id}
                to="/templates"
                className="group flex shrink-0 snap-center flex-col items-center text-center"
              >
                <div className="flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56 lg:h-64 lg:w-64">
                  <img
                    src={tpl.image_url}
                    alt={tpl.title}
                    className="h-full w-full object-contain transition duration-500 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                </div>
                <span className="mt-4 text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                  {tpl.meta?.template_style || "Logo"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild>
            <Link to="/templates">
              Browse templates <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}