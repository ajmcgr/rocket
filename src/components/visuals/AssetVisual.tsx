import { useMemo, useState } from "react";
import { Copy, Check, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Logotype } from "@/components/Logotype";
import CanvasAssetPreview from "@/components/CanvasAssetPreview";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { isLogotype } from "@/lib/logotype";
import {
  tryJson, hexToRgb, rgbToHsl, contrastRatio,
  type ColorSystem, type FontSystem, type FounderBio,
  type BrandVoiceData, type BrandGuidelinesData,
  type LaunchCopyData, type ProductHuntCopyData,
  type SocialPostData, type PresentationData, type TemplateLibraryData,
} from "@/lib/assetSchemas";

/* ----------------------------- shared chrome ----------------------------- */
function Page({ label, title, children }: { label?: string; title?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {(label || title) && (
        <header className="border-b border-neutral-100 bg-neutral-50/60 px-6 py-4">
          {label && <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>}
          {title && <h2 className="mt-0.5 text-xl font-semibold text-neutral-900">{title}</h2>}
        </header>
      )}
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} {done ? "Copied" : label}
    </button>
  );
}

function ParagraphBlock({ text }: { text: string }) {
  const paras = (text || "").split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-800">
      {paras.map((p, i) => <p key={i} className="whitespace-pre-wrap">{p}</p>)}
    </div>
  );
}

/* ============================== COLOR SYSTEM ============================== */
function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s: string) {
  return (s || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ColorExportBar({
  data, roleSwatches, neutrals, grads,
}: {
  data: ColorSystem;
  roleSwatches: { name: string; hex?: string; role: string }[];
  neutrals: [string, string][];
  grads: NonNullable<ColorSystem["gradients"]>;
}) {
  const base = slug(data.name || "brand");
  const allHex = [
    ...roleSwatches.filter(s => s.hex).map(s => `${s.role}: ${s.hex!.toUpperCase()}`),
    ...neutrals.map(([k, hex]) => `neutral-${k}: ${hex.toUpperCase()}`),
  ].join("\n");
  const cssVars = [
    ":root {",
    ...roleSwatches.filter(s => s.hex).map(s => `  --color-${s.role}: ${s.hex!.toUpperCase()};`),
    ...neutrals.map(([k, hex]) => `  --color-neutral-${k}: ${hex.toUpperCase()};`),
    ...grads.map((g, i) => `  --gradient-${slug(g.name || `g${i + 1}`)}: linear-gradient(${g.angle ?? 135}deg, ${g.from}, ${g.to});`),
    "}",
  ].join("\n");
  const tw = [
    "// tailwind.config.js — extend.colors",
    "module.exports = {",
    "  theme: { extend: { colors: {",
    ...roleSwatches.filter(s => s.hex).map(s => `      ${s.role}: '${s.hex!.toUpperCase()}',`),
    neutrals.length ? `      neutral: {\n${neutrals.map(([k, hex]) => `        ${k.replace(/[^a-z0-9]/gi, "")}: '${hex.toUpperCase()}',`).join("\n")}\n      },` : "",
    "  } } }",
    "};",
  ].filter(Boolean).join("\n");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">Export</span>
      <CopyBtn text={allHex} label="Copy all hex" />
      <button
        onClick={() => downloadText(`${base}-colors.css`, cssVars, "text/css")}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >CSS variables</button>
      <button
        onClick={() => downloadText(`${base}-tailwind.js`, tw, "text/javascript")}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >Tailwind config</button>
      <button
        onClick={() => downloadText(`${base}-colors.json`, JSON.stringify(data, null, 2), "application/json")}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >JSON</button>
    </div>
  );
}

function SwatchCard({ name, hex, role }: { name: string; hex: string; role?: string }) {
  const rgb = hexToRgb(hex);
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;
  const onWhite = contrastRatio(hex, "#FFFFFF");
  const onBlack = contrastRatio(hex, "#000000");
  const textHex = onWhite >= onBlack ? "#FFFFFF" : "#0A0A0A";
  const wcag = (r: number) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA Large" : "Fail");
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex h-32 items-end p-4" style={{ background: hex, color: textHex }}>
        <div>
          <div className="text-xs uppercase tracking-wider opacity-80">{role || name}</div>
          <div className="font-mono text-lg font-semibold">{hex.toUpperCase()}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 py-3 text-[11px] text-neutral-600">
        {rgb && <div>RGB <span className="font-mono text-neutral-900">{rgb.r}, {rgb.g}, {rgb.b}</span></div>}
        {hsl && <div>HSL <span className="font-mono text-neutral-900">{hsl.h}, {hsl.s}%, {hsl.l}%</span></div>}
        <div>On white <span className="font-mono text-neutral-900">{onWhite.toFixed(1)} {wcag(onWhite)}</span></div>
        <div>On black <span className="font-mono text-neutral-900">{onBlack.toFixed(1)} {wcag(onBlack)}</span></div>
      </div>
      <div className="flex justify-end border-t border-neutral-100 px-3 py-2"><CopyBtn text={hex.toUpperCase()} label="Hex" /></div>
    </div>
  );
}

function ColorSystemView({ data }: { data: ColorSystem }) {
  const primary = data.primary || data.accent || "#3B82F6";
  const sec = data.secondary || data.neutral_dark || "#0F172A";
  const acc = data.accent || primary;
  const light = data.light_mode || {};
  const dark = data.dark_mode || {};
  const roleSwatches: { name: string; hex?: string; role: string }[] = [
    { name: "Primary", hex: data.primary, role: "primary" },
    { name: "Secondary", hex: data.secondary, role: "secondary" },
    { name: "Accent", hex: data.accent, role: "accent" },
    { name: "Success", hex: data.success, role: "success" },
    { name: "Warning", hex: data.warning, role: "warning" },
    { name: "Danger", hex: data.danger, role: "danger" },
  ].filter(s => !!s.hex) as any;
  const neutrals = data.neutrals ? Object.entries(data.neutrals) : [];
  const grads = data.gradients || [];

  return (
    <div className="space-y-6">
      {data.name && <div className="text-sm text-neutral-500">Palette: <span className="font-medium text-neutral-800">{data.name}</span></div>}

      <ColorExportBar data={data} roleSwatches={roleSwatches} neutrals={neutrals} grads={grads} />

      <Page label="Brand Colors" title="Role swatches">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {roleSwatches.map((s) => <SwatchCard key={s.role} name={s.name} hex={s.hex!} role={s.name} />)}
        </div>
      </Page>

      {neutrals.length > 0 && (
        <Page label="Neutrals" title="10-step neutral scale">
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${neutrals.length}, minmax(0, 1fr))` }}>
              {neutrals.map(([k, hex]) => {
                const onWhite = contrastRatio(hex, "#FFFFFF");
                const textHex = onWhite >= contrastRatio(hex, "#000000") ? "#FFFFFF" : "#0A0A0A";
                return (
                  <div key={k} className="flex h-24 flex-col justify-between p-2 text-[10px]" style={{ background: hex, color: textHex }}>
                    <span className="opacity-80">{k}</span>
                    <span className="font-mono">{hex.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Page>
      )}

      {grads.length > 0 && (
        <Page label="Gradients" title="Brand gradients">
          <div className="grid gap-3 md:grid-cols-3">
            {grads.map((g, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-neutral-200">
                <div className="h-28" style={{ background: `linear-gradient(${g.angle ?? 135}deg, ${g.from}, ${g.to})` }} />
                <div className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-medium text-neutral-800">{g.name || `Gradient ${i + 1}`}</span>
                  <span className="font-mono text-neutral-500">{g.from} → {g.to}</span>
                </div>
              </div>
            ))}
          </div>
        </Page>
      )}

      <Page label="Preview" title="UI examples">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">Light mode</div>
            <div className="p-6" style={{ background: light.background || "#FFFFFF", color: light.text || "#0A0A0A" }}>
              <div className="text-xs" style={{ color: light.muted_text || "#737373" }}>Dashboard</div>
              <div className="mt-1 text-xl font-semibold">Welcome back</div>
              <div className="mt-3 inline-flex gap-2">
                <button className="rounded-full px-4 py-1.5 text-sm" style={{ background: primary, color: "#FFFFFF" }}>Primary</button>
                <button className="rounded-full border px-4 py-1.5 text-sm" style={{ borderColor: light.border || "#E5E5E5", color: light.text || "#0A0A0A" }}>Secondary</button>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">Dark mode</div>
            <div className="p-6" style={{ background: dark.background || sec, color: dark.text || "#FFFFFF" }}>
              <div className="text-xs" style={{ color: dark.muted_text || "#A3A3A3" }}>Dashboard</div>
              <div className="mt-1 text-xl font-semibold">Welcome back</div>
              <div className="mt-3 inline-flex gap-2">
                <button className="rounded-full px-4 py-1.5 text-sm" style={{ background: acc, color: "#0A0A0A" }}>Primary</button>
                <button className="rounded-full border px-4 py-1.5 text-sm" style={{ borderColor: dark.border || "#262626", color: dark.text || "#FFFFFF" }}>Secondary</button>
              </div>
            </div>
          </div>
        </div>
      </Page>

      {(data.accessibility || data.usage || data.rationale) && (
        <Page label="Notes" title="Usage & accessibility">
          {data.usage && <p className="mb-2 text-sm leading-relaxed text-neutral-700"><strong>Usage.</strong> {data.usage}</p>}
          {data.accessibility && <p className="mb-2 text-sm leading-relaxed text-neutral-700"><strong>Accessibility.</strong> {data.accessibility}</p>}
          {data.rationale && <p className="text-sm leading-relaxed text-neutral-700"><strong>Rationale.</strong> {data.rationale}</p>}
        </Page>
      )}
    </div>
  );
}

/* =============================== FONT SYSTEM =============================== */
function FontExportBar({
  data, display, heading, body, mono,
}: { data: FontSystem; display: string; heading: string; body: string; mono: string }) {
  const families = Array.from(new Set([display, heading, body, mono].filter(Boolean)));
  const qs = families.map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`).join("&");
  const importCss = [
    `@import url('https://fonts.googleapis.com/css2?${qs}&display=swap');`,
    "",
    ":root {",
    `  --font-display: '${display}', serif;`,
    `  --font-heading: '${heading}', sans-serif;`,
    `  --font-body: '${body}', sans-serif;`,
    `  --font-mono: '${mono}', ui-monospace, monospace;`,
    "}",
  ].join("\n");
  const tw = [
    "// tailwind.config.js — extend.fontFamily",
    "module.exports = {",
    "  theme: { extend: { fontFamily: {",
    `      display: ['${display}', 'serif'],`,
    `      heading: ['${heading}', 'sans-serif'],`,
    `      body: ['${body}', 'sans-serif'],`,
    `      mono: ['${mono}', 'ui-monospace', 'monospace'],`,
    "  } } }",
    "};",
  ].join("\n");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">Export</span>
      <CopyBtn text={importCss} label="Copy @import + vars" />
      <button
        onClick={() => downloadText("fonts.css", importCss, "text/css")}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >CSS file</button>
      <button
        onClick={() => downloadText("fonts-tailwind.js", tw, "text/javascript")}
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >Tailwind config</button>
      <a
        href={`https://fonts.google.com/?query=${encodeURIComponent(families.join(" "))}`}
        target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50"
      >Open in Google Fonts</a>
    </div>
  );
}

function ensureFontLink(families: string[]) {
  const id = "rocket-visual-fonts";
  const want = families.filter(Boolean).join("|");
  if (typeof document === "undefined") return;
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (el && el.dataset.families === want) return;
  if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el); }
  el.dataset.families = want;
  const qs = families.filter(Boolean).map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`).join("&");
  el.href = `https://fonts.googleapis.com/css2?${qs}&display=swap`;
}

function FontSystemView({ data }: { data: FontSystem }) {
  const display = data.display_font || data.heading_font || "Playfair Display";
  const heading = data.heading_font || display;
  const body = data.body_font || "Inter";
  const mono = data.mono_font || "JetBrains Mono";
  useMemo(() => ensureFontLink([display, heading, body, mono]), [display, heading, body, mono]);

  const scale = data.scale || {};
  const sample = data.example_headline || "Make your product a brand.";
  const para = data.example_body || "A confident voice paired with timeless type. This specimen shows how the system holds up across weights, sizes, and line lengths in real product surfaces.";

  const rows: { key: string; label: string }[] = [
    { key: "h1", label: "Heading 1" }, { key: "h2", label: "Heading 2" }, { key: "h3", label: "Heading 3" },
    { key: "h4", label: "Heading 4" }, { key: "h5", label: "Heading 5" }, { key: "h6", label: "Heading 6" },
    { key: "body", label: "Body" }, { key: "small", label: "Small" },
  ];

  return (
    <div className="space-y-6">
      <FontExportBar data={data} display={display} heading={heading} body={body} mono={mono} />
      <Page label="Specimen" title="Typography system">
        <div className="rounded-xl bg-neutral-50 p-6">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{display} · Display</div>
          <div className="mt-2" style={{ fontFamily: `'${display}', serif`, fontSize: 84, lineHeight: 1.02, letterSpacing: "-0.03em", fontWeight: data.display_weight || 700 }}>
            {sample}
          </div>
        </div>
      </Page>

      <Page label="Scale" title="Type scale">
        <div className="divide-y divide-neutral-100">
          {rows.map(({ key, label }) => {
            const s = scale[key]; if (!s) return null;
            const fontFam = key.startsWith("h") ? heading : body;
            return (
              <div key={key} className="grid grid-cols-[140px_1fr_auto] items-center gap-4 py-4">
                <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
                <div style={{ fontFamily: `'${fontFam}', sans-serif`, fontSize: s.size_px, lineHeight: s.line_height, letterSpacing: s.tracking, fontWeight: s.weight }} className="text-neutral-900">
                  {key === "body" || key === "small" ? para : "The quick brown fox jumps."}
                </div>
                <div className="font-mono text-[11px] text-neutral-500">{s.size_px}px · {s.weight} · {s.line_height}</div>
              </div>
            );
          })}
        </div>
      </Page>

      <div className="grid gap-4 md:grid-cols-3">
        <Page label="Heading" title={heading}>
          <div style={{ fontFamily: `'${heading}', sans-serif`, fontSize: 40, lineHeight: 1.1, fontWeight: data.heading_weight || 700 }} className="text-neutral-900">Aa Bb Cc</div>
          <div className="mt-2 text-xs text-neutral-500">Use for section headings, marketing pages.</div>
        </Page>
        <Page label="Body" title={body}>
          <div style={{ fontFamily: `'${body}', sans-serif`, fontSize: 18, lineHeight: 1.6, fontWeight: data.body_weight || 400 }} className="text-neutral-900">Aa Bb Cc 123</div>
          <div className="mt-2 text-xs text-neutral-500">Use for paragraphs, UI labels, captions.</div>
        </Page>
        <Page label="Mono" title={mono}>
          <div style={{ fontFamily: `'${mono}', monospace`, fontSize: 18 }} className="text-neutral-900">Aa Bb Cc 123</div>
          <div className="mt-2 text-xs text-neutral-500">Use for code, data, and technical UI.</div>
        </Page>
      </div>

      {(data.pair_rationale || data.usage) && (
        <Page label="Notes" title="Pairing & usage">
          {data.pair_rationale && <p className="mb-2 text-sm leading-relaxed text-neutral-700"><strong>Pairing.</strong> {data.pair_rationale}</p>}
          {data.usage && <p className="text-sm leading-relaxed text-neutral-700"><strong>Usage.</strong> {data.usage}</p>}
        </Page>
      )}
    </div>
  );
}

/* ============================ BRAND GUIDELINES ============================ */
function BrandGuidelinesView({ data }: { data: BrandGuidelinesData }) {
  type Page = { label: string; title: string; render: () => React.ReactNode };
  const pages: Page[] = [];
  if (data.overview)     pages.push({ label: "01", title: "Overview", render: () => <ParagraphBlock text={data.overview!} /> });
  if (data.mission)      pages.push({ label: "02", title: "Mission", render: () => <ParagraphBlock text={data.mission!} /> });
  if (data.vision)       pages.push({ label: "03", title: "Vision", render: () => <ParagraphBlock text={data.vision!} /> });
  if (data.positioning)  pages.push({ label: "04", title: "Positioning", render: () => <blockquote className="border-l-4 border-brand pl-4 text-lg italic text-neutral-800">{data.positioning}</blockquote> });
  if (data.audience)     pages.push({ label: "05", title: "Audience", render: () => <ParagraphBlock text={data.audience!} /> });
  if (data.personas?.length) pages.push({ label: "06", title: "Personas", render: () => (
    <div className="grid gap-4 md:grid-cols-3">
      {data.personas!.map((p, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-5">
          <div className="text-[10px] uppercase tracking-wider text-brand">Persona {i + 1}</div>
          <h4 className="mt-1 text-base font-semibold text-neutral-900">{p.name}{p.role ? `, ${p.role}` : ""}</h4>
          {p.demographics && <p className="mt-2 text-xs text-neutral-600">{p.demographics}</p>}
          {p.quote && <p className="mt-3 border-l-2 border-neutral-300 pl-3 text-xs italic text-neutral-700">"{p.quote}"</p>}
          {(["goals","pains","triggers","channels"] as const).map((k) => (
            (p as any)[k]?.length ? (
              <div key={k} className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">{k}</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-700">{(p as any)[k].map((x: string, j: number) => <li key={j}>{x}</li>)}</ul>
              </div>
            ) : null
          ))}
        </div>
      ))}
    </div>
  )});
  if (data.personality_traits?.length) pages.push({ label: "07", title: "Personality", render: () => (
    <div className="grid gap-2 md:grid-cols-2">
      {data.personality_traits!.map((t, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="font-semibold text-neutral-900">{t.trait}</div><div className="mt-1 text-sm text-neutral-600">{t.description}</div></div>
      ))}
    </div>
  )});
  if (data.values?.length) pages.push({ label: "08", title: "Values", render: () => (
    <div className="grid gap-2 md:grid-cols-2">
      {data.values!.map((v, i) => (
        <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="font-semibold text-neutral-900">{v.name}</div><div className="mt-1 text-sm text-neutral-600">{v.description}</div></div>
      ))}
    </div>
  )});
  if (data.voice) pages.push({ label: "09", title: "Voice & Tone", render: () => (
    <div>
      {data.voice!.overview && <ParagraphBlock text={data.voice!.overview} />}
      {data.voice!.tone_shifts?.length && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {data.voice!.tone_shifts.map((t, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
              <div className="text-[10px] uppercase tracking-wider text-brand">{t.context}</div>
              <p className="mt-1 text-sm text-neutral-800">{t.guidance}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )});
  if (data.messaging) pages.push({ label: "10", title: "Messaging", render: () => (
    <div className="space-y-4">
      {data.messaging!.core_message && <ParagraphBlock text={data.messaging!.core_message} />}
      {data.messaging!.value_prop && <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-base font-medium text-neutral-900">{data.messaging!.value_prop}</div>}
      {data.messaging!.pillars?.length && (
        <div className="grid gap-3 md:grid-cols-3">
          {data.messaging!.pillars.map((pl, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-[10px] uppercase tracking-wider text-brand">Pillar {i + 1}</div>
              <h4 className="mt-1 font-semibold text-neutral-900">{pl.name}</h4>
              <p className="mt-1 text-xs text-neutral-600">{pl.proof}</p>
            </div>
          ))}
        </div>
      )}
      {data.messaging!.reasons_to_believe?.length && (
        <div><div className="text-xs uppercase tracking-wider text-neutral-500">Reasons to believe</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-800">{data.messaging!.reasons_to_believe.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
      )}
    </div>
  )});
  if (data.taglines?.length) pages.push({ label: "11", title: "Taglines", render: () => (
    <div className="grid gap-2 md:grid-cols-2">
      {data.taglines!.map((t, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base font-medium text-neutral-900">"{t}"<CopyBtn text={t} /></div>
      ))}
    </div>
  )});
  if (data.elevator_pitch) pages.push({ label: "12", title: "Elevator pitch", render: () => (
    <div className="grid gap-3">
      {(["one_sentence","thirty_second","two_minute"] as const).map((k) => data.elevator_pitch![k] ? (
        <div key={k} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-brand">{k.replace(/_/g, " ")}</div><CopyBtn text={data.elevator_pitch![k]!} /></div>
          <ParagraphBlock text={data.elevator_pitch![k]!} />
        </div>
      ) : null)}
    </div>
  )});
  if (data.do?.length || data.dont?.length) pages.push({ label: "13", title: "Do & don't", render: () => (
    <div className="grid gap-3 md:grid-cols-2">
      <div><h4 className="mb-2 text-sm font-semibold text-emerald-700">Do</h4><ul className="space-y-1.5 text-sm">{(data.do || []).map((d, i) => <li key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-emerald-900">✓ {d}</li>)}</ul></div>
      <div><h4 className="mb-2 text-sm font-semibold text-rose-700">Don't</h4><ul className="space-y-1.5 text-sm">{(data.dont || []).map((d, i) => <li key={i} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-rose-900">✗ {d}</li>)}</ul></div>
    </div>
  )});
  if (data.website_examples) pages.push({ label: "14", title: "Website examples", render: () => (
    <div className="space-y-3">
      {data.website_examples!.hero && <div className="rounded-2xl bg-gradient-to-br from-neutral-50 to-white p-8 text-center"><h2 className="text-3xl font-semibold text-neutral-900">{data.website_examples!.hero.headline}</h2><p className="mt-2 text-neutral-600">{data.website_examples!.hero.subheadline}</p></div>}
      {data.website_examples!.feature && <div className="rounded-2xl border border-neutral-200 bg-white p-6"><h3 className="text-xl font-semibold text-neutral-900">{data.website_examples!.feature.headline}</h3><p className="mt-2 text-neutral-700">{data.website_examples!.feature.body}</p></div>}
      {data.website_examples!.cta && <div className="rounded-2xl bg-brand p-6 text-brand-foreground"><h3 className="text-xl font-semibold">{data.website_examples!.cta.headline}</h3><p className="mt-2 opacity-90">{data.website_examples!.cta.body}</p></div>}
    </div>
  )});
  if (data.social_examples?.length) pages.push({ label: "15", title: "Social examples", render: () => <SocialPostsGrid posts={data.social_examples!} /> });
  if (data.launch_examples?.length) pages.push({ label: "16", title: "Launch examples", render: () => (
    <div className="grid gap-3">{data.launch_examples!.map((l, i) => (
      <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-brand">{l.label}</div><CopyBtn text={l.copy} /></div><ParagraphBlock text={l.copy} /></div>
    ))}</div>
  )});

  const [idx, setIdx] = useState(0);
  if (!pages.length) return <ParseFallback raw="" message="No brand guidelines content." />;
  const page = pages[idx];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-50 p-2">
        {pages.map((p, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`flex h-20 w-32 shrink-0 flex-col justify-between rounded-lg border p-2 text-left text-[10px] transition ${idx === i ? "border-brand bg-white shadow-xs" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
            <span className="text-neutral-400">{p.label}</span>
            <span className="line-clamp-2 font-medium text-neutral-800">{p.title}</span>
          </button>
        ))}
      </div>
      <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <header className="border-b border-neutral-100 bg-gradient-to-br from-neutral-50 to-white px-10 py-8">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">{data.brand_name || "Brand"} — Page {idx + 1} of {pages.length}</div>
          <h2 className="mt-2 text-3xl font-semibold text-neutral-900">{page.title}</h2>
        </header>
        <div className="px-10 py-8">{page.render()}</div>
        <footer className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-10 py-3">
          <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
          <span className="text-[11px] text-neutral-500">{page.title}</span>
          <button onClick={() => setIdx(Math.min(pages.length - 1, idx + 1))} disabled={idx >= pages.length - 1} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </footer>
      </article>
    </div>
  );
}

function SocialPostsGrid({ posts }: { posts: { platform: string; copy: string }[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {posts.map((p, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-neutral-900 text-[10px] text-white">{p.platform?.[0]?.toUpperCase() || "P"}</div>
              <span className="text-[11px] uppercase tracking-wider text-neutral-500">{p.platform}</span>
            </div>
            <CopyBtn text={p.copy} />
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{p.copy}</p>
        </div>
      ))}
    </div>
  );
}

/* =============================== BRAND VOICE =============================== */
function BrandVoiceView({ data }: { data: BrandVoiceData }) {
  return (
    <div className="space-y-6">
      {data.overview && <Page label="Voice" title="Overview"><ParagraphBlock text={data.overview} /></Page>}
      {data.pillars?.length ? (
        <Page label="Pillars" title="Voice pillars">
          <div className="grid gap-4 md:grid-cols-2">
            {data.pillars.map((p, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-brand">Pillar {i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold text-neutral-900">{p.name}</h3>
                <p className="mt-2 text-sm text-neutral-700">{p.description}</p>
                {p.why_it_fits && <p className="mt-2 text-xs text-neutral-500"><strong className="text-neutral-700">Why it fits:</strong> {p.why_it_fits}</p>}
                {p.example && <p className="mt-3 border-l-2 border-brand/30 pl-3 text-sm italic text-neutral-800">"{p.example}"</p>}
              </div>
            ))}
          </div>
        </Page>
      ) : null}
      {data.tone_by_context?.length ? (
        <Page label="Tone" title="Tone across contexts">
          <div className="grid gap-3 md:grid-cols-2">
            {data.tone_by_context.map((t, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="text-[10px] uppercase tracking-wider text-brand">{t.context}</div>
                <p className="mt-1 text-sm text-neutral-800">{t.guidance}</p>
              </div>
            ))}
          </div>
        </Page>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {data.do?.length ? (
          <Page label="Do" title="What we say">
            <ul className="space-y-2 text-sm">{data.do.map((d, i) => (
              <li key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-emerald-900">✓ {d.phrase}{d.why ? <span className="block text-[11px] text-emerald-700/80">{d.why}</span> : null}</li>
            ))}</ul>
          </Page>
        ) : null}
        {data.dont?.length ? (
          <Page label="Don't" title="What we don't say">
            <ul className="space-y-2 text-sm">{data.dont.map((d, i) => (
              <li key={i} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-rose-900">✗ {d.phrase}{d.why ? <span className="block text-[11px] text-rose-700/80">{d.why}</span> : null}</li>
            ))}</ul>
          </Page>
        ) : null}
      </div>
      {data.website_examples?.length ? (
        <Page label="Channel" title="Website examples">
          <div className="grid gap-3 md:grid-cols-3">{data.website_examples.map((w, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-brand">{w.label}</div><CopyBtn text={w.copy} /></div><p className="mt-1 text-sm text-neutral-800">{w.copy}</p></div>
          ))}</div>
        </Page>
      ) : null}
      {data.social_examples?.length ? <Page label="Channel" title="Social examples"><SocialPostsGrid posts={data.social_examples} /></Page> : null}
      {data.launch_examples?.length ? (
        <Page label="Channel" title="Launch examples">
          <div className="grid gap-3">{data.launch_examples.map((l, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-wider text-brand">{l.label}</div><CopyBtn text={l.copy} /></div><ParagraphBlock text={l.copy} /></div>
          ))}</div>
        </Page>
      ) : null}
      {data.email_examples?.length ? (
        <Page label="Channel" title="Email examples">
          <div className="grid gap-3 md:grid-cols-2">{data.email_examples.map((e, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 bg-neutral-50/60 px-4 py-2 text-xs"><span className="text-neutral-500">Subject:</span> <span className="font-medium text-neutral-900">{e.subject}</span></div>
              <div className="p-4"><ParagraphBlock text={e.body} /></div>
            </div>
          ))}</div>
        </Page>
      ) : null}
    </div>
  );
}

/* ============================ COPY BOARDS (cards) ============================ */
function CopyCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[0.18em] text-brand">{label}</div><CopyBtn text={body} /></div>
      <h3 className="mt-1 text-base font-semibold text-neutral-900">{title}</h3>
      <ParagraphBlock text={body} />
    </div>
  );
}

function LaunchCopyView({ data }: { data: LaunchCopyData }) {
  return (
    <div className="space-y-4">
      {data.hero && (
        <Page label="Hero" title="Website hero">
          <div className="rounded-2xl bg-gradient-to-br from-neutral-50 to-white p-10 text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-neutral-900">{data.hero.headline}</h2>
            <p className="mt-3 text-lg text-neutral-600">{data.hero.subheadline}</p>
            <button className="mt-5 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-brand-foreground">{data.hero.cta}</button>
          </div>
        </Page>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {data.tagline && <CopyCard label="Launch" title="Tagline" body={data.tagline} />}
        {data.one_liner && <CopyCard label="Launch" title="One-liner" body={data.one_liner} />}
        {data.short_description && <CopyCard label="Launch" title="Short description" body={data.short_description} />}
        {data.medium_description && <CopyCard label="Launch" title="Medium description" body={data.medium_description} />}
      </div>
      {data.long_description && <CopyCard label="Launch" title="Long description" body={data.long_description} />}
      {data.cta_variations?.length ? (
        <Page label="Launch" title="CTA variations">
          <div className="flex flex-wrap gap-2">{data.cta_variations.map((c, i) => (
            <div key={i} className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm">{c}<CopyBtn text={c} /></div>
          ))}</div>
        </Page>
      ) : null}
      {data.launch_announcement && <CopyCard label="Launch" title="Announcement post" body={data.launch_announcement} />}
      {data.seo && (
        <Page label="SEO" title="Search snippet">
          <div className="max-w-2xl rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-lg text-blue-700">{data.seo.title}</div>
            <div className="text-xs text-emerald-700">https://yourdomain.com</div>
            <div className="mt-1 text-sm text-neutral-600">{data.seo.meta_description}</div>
          </div>
        </Page>
      )}
    </div>
  );
}

function ProductHuntCopyView({ data }: { data: ProductHuntCopyData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {data.tagline && <CopyCard label="PH" title="Tagline" body={data.tagline} />}
        {data.short_description && <CopyCard label="PH" title="Short description" body={data.short_description} />}
      </div>
      {data.full_description && <CopyCard label="PH" title="Full description" body={data.full_description} />}
      {data.first_comment && <CopyCard label="PH" title="First comment" body={data.first_comment} />}
      {data.maker_comment && <CopyCard label="PH" title="Maker comment" body={data.maker_comment} />}
      {data.launch_tweet && (
        <Page label="Launch tweet" title="Tweet preview">
          <div className="max-w-xl rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-neutral-900" /><div><div className="text-sm font-semibold">You</div><div className="text-xs text-neutral-500">@you</div></div></div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-900">{data.launch_tweet}</p>
            <div className="mt-2 flex justify-end"><CopyBtn text={data.launch_tweet} /></div>
          </div>
        </Page>
      )}
      {data.faq?.length ? (
        <Page label="PH" title="FAQ">
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {data.faq.map((f, i) => (
              <div key={i} className="p-4"><div className="font-semibold text-neutral-900">Q: {f.q}</div><div className="mt-1 text-sm text-neutral-700">A: {f.a}</div></div>
            ))}
          </div>
        </Page>
      ) : null}
      {data.community_responses?.length ? (
        <Page label="PH" title="Community reply templates">
          <div className="grid gap-3 md:grid-cols-3">{data.community_responses.map((r, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="text-[10px] uppercase tracking-wider text-brand">{r.scenario}</div><p className="mt-1 text-sm text-neutral-800">{r.reply}</p><div className="mt-2 flex justify-end"><CopyBtn text={r.reply} /></div></div>
          ))}</div>
        </Page>
      ) : null}
      {data.topics?.length ? (
        <Page label="PH" title="Topics">
          <div className="flex flex-wrap gap-2">{data.topics.map((t, i) => <span key={i} className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">{t}</span>)}</div>
        </Page>
      ) : null}
    </div>
  );
}

/* ============================== SOCIAL LIBRARY ============================== */
function SocialView({ data }: { data: SocialPostData }) {
  if (data.kind === "post") {
    return <SocialPostsGrid posts={[{ platform: data.platform, copy: data.copy }]} />;
  }
  return (
    <div className="space-y-6">
      {data.categories.map((cat, i) => (
        <Page key={i} label="Category" title={cat.name}>
          <SocialPostsGrid posts={cat.posts} />
        </Page>
      ))}
    </div>
  );
}

/* =============================== FOUNDER BIO =============================== */
function FounderBioView({ data }: { data: FounderBio }) {
  const cards: { label: string; title: string; text?: string; mono?: boolean }[] = [
    { label: "X / Twitter", title: "Bio (≤160)", text: data.x_bio, mono: true },
    { label: "LinkedIn", title: "Headline", text: data.linkedin_headline },
    { label: "LinkedIn", title: "About", text: data.linkedin_about },
    { label: "Bio", title: "Short", text: data.short },
    { label: "Bio", title: "Medium", text: data.medium },
    { label: "Bio", title: "Long", text: data.long },
    { label: "Speaking", title: "Speaker bio", text: data.speaker_bio },
    { label: "Press", title: "Press bio", text: data.press_bio },
  ].filter(c => !!c.text);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.18em] text-brand">{c.label}</div>
            <CopyBtn text={c.text!} />
          </div>
          <h3 className="mt-1 text-base font-semibold text-neutral-900">{c.title}</h3>
          <p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800 ${c.mono ? "font-mono" : ""}`}>{c.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ============================= PRESENTATION DECK ============================= */
function PresentationView({ data }: { data: PresentationData }) {
  const list = data.slides || [];
  const [idx, setIdx] = useState(0);
  if (!list.length) return <ParseFallback raw="" message="No slides." />;
  const slide = list[idx];
  return (
    <div className="space-y-3">
      {data.overview && <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-sm text-neutral-700">{data.overview}</div>}
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-50 p-2">
        {list.map((s, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`flex h-24 w-40 shrink-0 flex-col justify-between rounded-lg border p-2 text-left transition ${idx === i ? "border-brand bg-white shadow-xs" : "border-neutral-200 bg-white hover:border-neutral-300"}`}>
            <span className="text-[10px] text-neutral-400">Slide {i + 1}</span>
            <span className="line-clamp-2 text-[11px] font-medium text-neutral-800">{s.title}</span>
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="grid aspect-[16/9] grid-rows-[auto_1fr_auto] bg-gradient-to-br from-white to-neutral-50">
          <div className="px-12 pt-10 text-[11px] uppercase tracking-[0.2em] text-neutral-400">Slide {idx + 1} / {list.length}{slide.layout ? ` · ${slide.layout}` : ""}</div>
          <div className="flex flex-col justify-center px-12">
            {slide.big_number ? (
              <div><div className="text-7xl font-bold tracking-tight text-neutral-900">{slide.big_number.value}</div><div className="mt-2 text-base text-neutral-600">{slide.big_number.label}</div></div>
            ) : slide.quote ? (
              <div><blockquote className="text-3xl font-medium leading-snug text-neutral-900">"{slide.quote.text}"</blockquote>{slide.quote.attribution && <div className="mt-3 text-sm text-neutral-500">— {slide.quote.attribution}</div>}</div>
            ) : (
              <>
                <h2 className="text-4xl font-semibold leading-tight text-neutral-900">{slide.title}</h2>
                {slide.purpose && <p className="mt-3 max-w-2xl text-base text-neutral-600">{slide.purpose}</p>}
                {slide.bullets?.length ? <ul className="mt-6 max-w-2xl space-y-2 text-base text-neutral-800">{slide.bullets.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-brand" />{b}</li>)}</ul> : null}
              </>
            )}
          </div>
          {slide.visual_guidance && <div className="px-12 pb-8 text-xs italic text-neutral-500">Visual direction · {slide.visual_guidance}</div>}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/60 px-6 py-3">
          <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
          <span className="text-[11px] text-neutral-500">{idx + 1} of {list.length}</span>
          <button onClick={() => setIdx(Math.min(list.length - 1, idx + 1))} disabled={idx >= list.length - 1} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {data.layout_notes && <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-xs text-neutral-600"><strong className="text-neutral-800">Layout notes.</strong> {data.layout_notes}</div>}
    </div>
  );
}

/* ============================== TEMPLATE LIBRARY ============================== */
function TemplateLibraryView({ data }: { data: TemplateLibraryData }) {
  return (
    <div className="space-y-6">
      {data.groups.map((group, gi) => (
        <Page key={gi} label="Group" title={group.name}>
          <div className="grid gap-3 md:grid-cols-2">
            {group.templates.map((t, ti) => (
              <div key={ti} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-neutral-900">{t.name}</h4>
                  <CopyBtn text={t.body} />
                </div>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 font-sans text-sm leading-relaxed text-neutral-800">{t.body}</pre>
              </div>
            ))}
          </div>
        </Page>
      ))}
    </div>
  );
}

function ParseFallback({ raw, message }: { raw: string; message?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          <div className="font-medium">{message || "This design didn't parse into a visual."}</div>
          <p className="mt-1 text-xs text-amber-800/80">Use the "Variation" button above to regenerate. The structured renderer needs valid JSON from the model.</p>
          {raw && (
            <button onClick={() => setOpen(o => !o)} className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 hover:bg-amber-50">
              {open ? "Hide raw output" : "Show raw output"}
            </button>
          )}
          {open && raw && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-200 bg-white p-3 font-mono text-[11px] text-neutral-700">{raw}</pre>}
        </div>
      </div>
    </div>
  );
}

/* =================================== ROUTER =================================== */
export default function AssetVisual({ asset }: { asset: any }) {
  const type = asset?.asset_type as string;
  const content: string = asset?.content || "";
  const json = useMemo(() => tryJson(content), [content]);
  const logotypeAsset = isLogotype(asset);
  const canvasAsset = isCanvasAsset(asset);

  if (logotypeAsset) {
    return (
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <header className="border-b border-neutral-100 bg-neutral-50/60 px-6 py-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Logotype</div>
          <h2 className="mt-0.5 text-xl font-semibold text-neutral-900">{asset?.title || "Wordmark"}</h2>
        </header>
        <div className="h-[280px] bg-white px-6 py-6">
          <Logotype state={asset.editor_state} fit="contain" />
        </div>
      </section>
    );
  }

  if (canvasAsset) {
    return (
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <header className="border-b border-neutral-100 bg-neutral-50/60 px-6 py-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Logo Lockup</div>
          <h2 className="mt-0.5 text-xl font-semibold text-neutral-900">{(asset as any)?.title || "Logo Lockup"}</h2>
        </header>
        <div className="aspect-[4/3] bg-white p-4">
          <CanvasAssetPreview elements={asset.editor_state} className="h-full w-full" />
        </div>
      </section>
    );
  }

  if (type === "color_system")     return json ? <ColorSystemView data={json} /> : <ParseFallback raw={content} message="Color system didn't parse." />;
  if (type === "font_system")      return json ? <FontSystemView data={json} /> : <ParseFallback raw={content} message="Font system didn't parse." />;
  if (type === "founder_bio")      return json ? <FounderBioView data={json} /> : <ParseFallback raw={content} message="Founder bio didn't parse." />;
  if (type === "brand_guidelines") return json ? <BrandGuidelinesView data={json} /> : <ParseFallback raw={content} message="Brand guidelines didn't parse." />;
  if (type === "brand_voice")      return json ? <BrandVoiceView data={json} /> : <ParseFallback raw={content} message="Brand voice didn't parse." />;
  if (type === "launch_copy")      return json ? <LaunchCopyView data={json} /> : <ParseFallback raw={content} message="Launch copy didn't parse." />;
  if (type === "product_hunt_copy") return json ? <ProductHuntCopyView data={json} /> : <ParseFallback raw={content} message="Product Hunt copy didn't parse." />;
  if (type === "social_post")      return json?.kind ? <SocialView data={json} /> : json?.copy ? <SocialView data={{ kind: "post", platform: json.platform || "Post", copy: json.copy }} /> : content ? <SocialView data={{ kind: "post", platform: "Post", copy: content }} /> : <ParseFallback raw={content} message="Social post didn't parse." />;
  if (type === "presentation")     return json?.slides ? <PresentationView data={json} /> : <ParseFallback raw={content} message="Presentation didn't parse." />;
  if (type === "template")         return json?.groups ? <TemplateLibraryView data={json} /> : <ParseFallback raw={content} message="Template library didn't parse." />;

  return <ParseFallback raw={content} message="Unsupported asset type." />;
}

export function hasVisualRenderer(asset: any): boolean {
  if (isCanvasAsset(asset)) return true;
  if (isLogotype(asset)) return true;
  const t = asset?.asset_type;
  return [
    "color_system","font_system","founder_bio","brand_guidelines","brand_voice",
    "launch_copy","product_hunt_copy","social_post","presentation","template",
  ].includes(t);
}
