import { useMemo } from "react";
import { tryJson } from "@/lib/assetSchemas";
import { normalizeAssetType } from "@/lib/assetExperience";

/**
 * Data-driven cover art for brand (text) assets. Renders a small SVG-ish
 * preview based on the asset type & parsed content — never a blank card.
 */

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

function initials(text: string, max = 2): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, max).map((w) => w[0]?.toUpperCase() || "").join("") || "•";
}

function firstLine(text?: string, n = 90): string {
  const s = String(text || "").replace(/[#>*_`]/g, "").trim();
  const line = s.split(/\n/).map((l) => l.trim()).find(Boolean) || "";
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
}

function ColorCover({ data, title }: { data: any; title: string }) {
  const swatches: string[] = [
    data?.primary, data?.secondary, data?.accent,
    data?.success, data?.warning, data?.danger,
  ].filter(Boolean);
  const grads = Array.isArray(data?.gradients) ? data.gradients.slice(0, 1) : [];
  const bg = swatches[0] || "#1676e3";
  const grad = grads[0];
  const bgStyle = grad
    ? { background: `linear-gradient(${grad.angle ?? 135}deg, ${grad.from}, ${grad.to})` }
    : { background: bg };
  return (
    <div className="relative flex h-full w-full flex-col justify-between p-4 text-white" style={bgStyle}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">Palette</div>
      <div className="truncate text-sm font-semibold drop-shadow-xs">{data?.name || title}</div>
      <div className="flex gap-1.5">
        {(swatches.length ? swatches : ["#0ea5e9", "#1676e3", "#0f172a"]).slice(0, 6).map((c, i) => (
          <div key={i} className="h-6 w-6 rounded-md border border-white/40 shadow-xs" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function FontCover({ data, title }: { data: any; title: string }) {
  const display = data?.display_font || data?.heading_font || "Playfair Display";
  const body = data?.body_font || "Inter";
  const sample = data?.example_headline || title || "Aa";
  return (
    <div className="flex h-full w-full flex-col justify-between bg-neutral-50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Typography</div>
      <div
        className="truncate text-4xl font-semibold text-neutral-900"
        style={{ fontFamily: `'${display}', serif`, letterSpacing: "-0.03em" }}
      >
        {initials(sample, 2)}a
      </div>
      <div className="flex items-center justify-between text-[10px] text-neutral-500">
        <span className="truncate">{display}</span>
        <span className="truncate opacity-70">{body}</span>
      </div>
    </div>
  );
}

function QuoteCover({
  title, body, tag, tint = "sky",
}: { title: string; body?: string; tag: string; tint?: "sky" | "amber" | "violet" | "emerald" | "rose" }) {
  const tintMap: Record<string, string> = {
    sky: "from-sky-50 to-white text-sky-700",
    amber: "from-amber-50 to-white text-amber-700",
    violet: "from-violet-50 to-white text-violet-700",
    emerald: "from-emerald-50 to-white text-emerald-700",
    rose: "from-rose-50 to-white text-rose-700",
  };
  return (
    <div className={`flex h-full w-full flex-col justify-between bg-gradient-to-br ${tintMap[tint]} p-4`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em]">{tag}</div>
      <div className="line-clamp-3 text-sm font-semibold leading-snug text-neutral-900">
        “{firstLine(body, 120) || title}”
      </div>
      <div className="truncate text-[10px] text-neutral-500">{title}</div>
    </div>
  );
}

function BioCover({ title, body, hue }: { title: string; body?: string; hue: number }) {
  const bg = `hsl(${hue} 70% 96%)`;
  const fg = `hsl(${hue} 60% 35%)`;
  return (
    <div className="flex h-full w-full flex-col justify-between p-4" style={{ background: bg }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: fg }}>Bio</div>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white shadow-xs"
        style={{ background: `hsl(${hue} 65% 45%)` }}
      >
        {initials(title, 2)}
      </div>
      <div className="line-clamp-2 text-[11px] text-neutral-600">{firstLine(body, 100)}</div>
    </div>
  );
}

function DocCover({ title, body, tag, hue }: { title: string; body?: string; tag: string; hue: number }) {
  const accent = `hsl(${hue} 70% 55%)`;
  return (
    <div className="flex h-full w-full flex-col justify-between bg-white p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {tag}
      </div>
      <div className="space-y-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-neutral-200" />
        <div className="h-1.5 w-full rounded-full bg-neutral-100" />
        <div className="h-1.5 w-5/6 rounded-full bg-neutral-100" />
        <div className="h-1.5 w-2/3 rounded-full bg-neutral-100" />
      </div>
      <div className="truncate text-xs font-medium text-neutral-800">{title}</div>
      {body ? <div className="line-clamp-2 text-[10px] text-neutral-500">{firstLine(body, 80)}</div> : null}
    </div>
  );
}

export default function BrandCover({ asset, className = "" }: { asset: any; className?: string }) {
  const type = normalizeAssetType(asset?.asset_type);
  const title = String(asset?.title || type.replace(/_/g, " ") || "Brand asset");
  const body = String(asset?.content || "");
  const parsed = useMemo(() => tryJson(body), [body]);
  const hue = useMemo(() => hashHue(asset?.id || title || type), [asset?.id, title, type]);

  let inner: React.ReactNode;
  if (type === "color_system") {
    inner = <ColorCover data={parsed || {}} title={title} />;
  } else if (type === "font_system" || type === "typography_system") {
    inner = <FontCover data={parsed || {}} title={title} />;
  } else if (type === "brand_voice" || type === "tone_of_voice") {
    inner = <QuoteCover title={title} body={parsed?.mission || parsed?.summary || body} tag="Voice" tint="violet" />;
  } else if (type === "positioning" || type === "value_proposition") {
    inner = <QuoteCover title={title} body={parsed?.statement || parsed?.summary || body} tag="Positioning" tint="sky" />;
  } else if (type === "messaging_framework") {
    inner = <DocCover title={title} body={parsed?.summary || body} tag="Messaging" hue={hue} />;
  } else if (type === "launch_copy") {
    inner = <QuoteCover title={title} body={parsed?.headline || parsed?.tagline || body} tag="Launch" tint="amber" />;
  } else if (type === "product_hunt_copy" || type === "ph_copy") {
    inner = <QuoteCover title={title} body={parsed?.tagline || parsed?.headline || body} tag="Product Hunt" tint="rose" />;
  } else if (type === "social_post" || type === "social_copy") {
    inner = <QuoteCover title={title} body={parsed?.post || parsed?.text || body} tag="Social" tint="emerald" />;
  } else if (type === "founder_bio" || type === "company_bio" || type === "press_bio") {
    inner = <BioCover title={parsed?.name || title} body={parsed?.short || parsed?.summary || body} hue={hue} />;
  } else if (type === "website_copy" || type === "email_copy") {
    inner = <DocCover title={title} body={parsed?.headline || body} tag={type === "email_copy" ? "Email" : "Website"} hue={hue} />;
  } else if (type === "brand_guidelines") {
    inner = <DocCover title={title} body={parsed?.summary || body} tag="Guidelines" hue={hue} />;
  } else {
    inner = <DocCover title={title} body={body} tag={type.replace(/_/g, " ") || "Brand"} hue={hue} />;
  }

  return <div className={`h-full w-full overflow-hidden ${className}`}>{inner}</div>;
}