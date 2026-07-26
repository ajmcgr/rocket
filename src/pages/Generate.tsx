import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { assetHref } from "@/lib/assetExperience";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowUp, Loader2, Sparkles, Wand2, Image as ImageIcon, Type, Palette, Megaphone, Rocket as RocketIcon, Wand, Paintbrush, Send, Radio, FileText, LayoutTemplate, Camera, Layers, Shapes, LayoutGrid, List as ListIcon, Star, MoreHorizontal, Copy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OutOfCreditsModal from "@/components/OutOfCreditsModal";
import { Logotype } from "@/components/Logotype";
import CanvasAssetPreview from "@/components/CanvasAssetPreview";
import AssetThumbnail from "@/components/AssetThumbnail";
import { tryJson, type ColorSystem, type FontSystem, type BrandVoiceData, type BrandGuidelinesData, type LaunchCopyData, type ProductHuntCopyData, type SocialPostData, type FounderBio, type PresentationData, type TemplateLibraryData } from "@/lib/assetSchemas";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { buildLogotypeVariants, pickLogotypeText } from "@/lib/logotype";
import AssetVisual, { hasVisualRenderer } from "@/components/visuals/AssetVisual";
import { handleAiError } from "@/lib/aiErrors";
import { track } from "@/lib/analytics";

const supabase = _sb as any;

function withResolvedLogotypeText(asset: any) {
  const state = asset?.editor_state;
  if (state?.kind !== "logotype") return state;
  const current = String(state.text || "").trim();
  const isGeneric = /^(brand|logo|logotype|wordmark|text logo)$/i.test(current);
  if (!isGeneric) return state;
  const ctx = asset?.meta?.brand_context || {};
  const resolved = pickLogotypeText({
    prompt: asset?.prompt,
    productName: ctx.productName,
    url: ctx.url || asset?.source_url,
  });
  return resolved ? { ...state, text: resolved, color: state.color || ctx.colors?.[0] } : state;
}

function getDirectionInstruction(asset: any) {
  if (!asset) return "";
  const context = asset.meta?.brand_context || asset.meta?.brandContext || {};
  const details = [
    asset.prompt && `Original brief: ${String(asset.prompt).slice(0, 500)}`,
    context.productName && `Brand: ${context.productName}`,
    Array.isArray(context.colors) && context.colors.length && `Colors: ${context.colors.slice(0, 6).join(", ")}`,
    Array.isArray(context.fonts) && context.fonts.length && `Fonts: ${context.fonts.slice(0, 3).join(", ")}`,
  ].filter(Boolean);
  return [
    "Use the approved brand direction below as visual context. Keep its distinctive choices coherent, but create a new original design.",
    `Approved ${String(asset.asset_type || "design").replace(/_/g, " ")}: ${asset.title || "Untitled design"}.`,
    ...details,
  ].join("\n");
}

function getBrandKitInstruction(context: any) {
  if (!context) return "";
  const details = [
    context.productName && `Brand: ${context.productName}`,
    Array.isArray(context.colors) && context.colors.length && `Use this colour palette: ${context.colors.slice(0, 6).join(", ")}`,
    Array.isArray(context.fonts) && context.fonts.length && `Use these typefaces: ${context.fonts.slice(0, 3).join(", ")}`,
    context.positioning && `Positioning: ${context.positioning}`,
    context.voice?.tone && `Voice: ${context.voice.tone}`,
    Array.isArray(context.voice?.traits) && context.voice.traits.length && `Voice traits: ${context.voice.traits.slice(0, 5).join(", ")}`,
  ].filter(Boolean);
  if (!details.length) return "";
  return ["Use the active Rocket brand kit as a firm creative system. Keep this design recognisably on-brand.", ...details].join("\n");
}

function buildProjectBrandContext(project: any, assets: any[]) {
  const base: Record<string, any> = {};
  const find = (...types: string[]) => assets.find((asset) => types.includes(asset.asset_type));
  const logo = find("logo", "logotype", "wordmark");
  const colors = tryJson<ColorSystem>(find("color_system", "design_color_palette")?.content || "");
  const fonts = tryJson<FontSystem>(find("font_system", "design_typography")?.content || "");
  const voice = tryJson<BrandVoiceData>(find("brand_voice")?.content || "");
  const guidelines = tryJson<BrandGuidelinesData>(find("brand_guidelines", "design_style_direction")?.content || "");
  const palette = [colors?.primary, colors?.secondary, colors?.accent, colors?.neutral_dark, colors?.neutral_light].filter(Boolean) as string[];
  const typefaces = [fonts?.display_font, fonts?.heading_font, fonts?.body_font, fonts?.mono_font].filter(Boolean) as string[];
  const voiceContext = voice ? {
    tone: voice.overview,
    traits: voice.pillars?.map((pillar) => pillar.name).filter(Boolean),
    doNotSay: voice.dont?.map((item) => item.phrase).filter(Boolean),
  } : undefined;

  return {
    ...base,
    productName: base.productName || project?.name,
    url: base.url || undefined,
    logo: base.logo || logo?.thumbnail_url || logo?.image_url || undefined,
    colors: base.colors?.length ? base.colors : palette,
    fonts: base.fonts?.length ? base.fonts : typefaces,
    positioning: base.positioning || guidelines?.positioning || guidelines?.overview || undefined,
    targetCustomer: base.targetCustomer || guidelines?.audience || undefined,
    voice: base.voice || voiceContext,
  };
}

function AssetCardThumb({ asset }: { asset: any }) {
  const at = asset.asset_type as string;
  if (at === "logo" || at === "logotype" || at === "wordmark" || at === "brandmark" || at === "icon" || at === "app_icon" || at === "favicon") {
    return <AssetThumbnail asset={asset} background={asset?.meta?.background || null} />;
  }
  if (asset?.editor_state?.kind === "logotype") {
    return <Logotype state={withResolvedLogotypeText(asset)} fit="contain" />;
  }
  if (isCanvasAsset(asset)) {
    return <CanvasAssetPreview elements={asset.editor_state} className="h-full w-full" />;
  }
  if (at === "color_system") {
    const c = tryJson<ColorSystem>(asset.content || "");
    const swatches = [c?.primary, c?.secondary, c?.accent, c?.success, c?.warning, c?.danger].filter(Boolean) as string[];
    if (swatches.length) {
      return (
        <div className="grid aspect-square w-full grid-cols-2 grid-rows-2 overflow-hidden">
          {swatches.slice(0, 4).map((hex, i) => (
            <div key={i} className="flex items-end justify-start p-2" style={{ backgroundColor: hex }}>
              <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[9px] uppercase text-neutral-800">{hex}</span>
            </div>
          ))}
        </div>
      );
    }
  }
  if (at === "font_system") {
    const f = tryJson<FontSystem>(asset.content || "");
    const heading = f?.display_font || f?.heading_font || "Georgia";
    const body = f?.body_font || "system-ui";
    return (
      <div className="flex aspect-square w-full flex-col justify-center gap-2 bg-gradient-to-br from-neutral-50 to-neutral-100 p-5">
        <div className="text-[10px] uppercase tracking-wider text-neutral-400">Aa</div>
        <div className="text-3xl leading-tight text-neutral-900" style={{ fontFamily: `'${heading}', serif` }}>{heading}</div>
        <div className="mt-1 text-xs text-neutral-600" style={{ fontFamily: `'${body}', system-ui, sans-serif` }}>The quick brown fox · {body}</div>
      </div>
    );
  }
  if (at === "brand_voice") {
    const v = tryJson<BrandVoiceData>(asset.content || "");
    const pillars = v?.pillars?.slice(0, 3) || [];
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-brand/5 to-neutral-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">Voice</div>
        {pillars.length ? (
          <div className="space-y-1.5">
            {pillars.map((p, i) => (
              <div key={i} className="rounded-md bg-white/80 px-2 py-1 text-[11px] font-medium text-neutral-800">{p.name}</div>
            ))}
          </div>
        ) : (
          <div className="text-sm italic text-neutral-600 line-clamp-4">{v?.overview || "Brand voice"}</div>
        )}
        <div className="text-[9px] uppercase tracking-wider text-neutral-400">Tone · Pillars · Do/Don't</div>
      </div>
    );
  }
  if (at === "brand_guidelines") {
    const g = tryJson<BrandGuidelinesData>(asset.content || "");
    const tagline = g?.taglines?.[0] || g?.elevator_pitch?.one_sentence;
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-neutral-900 to-neutral-700 p-4 text-white">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Brand Book</div>
        <div className="space-y-1">
          <div className="text-lg font-semibold leading-tight line-clamp-2">{g?.brand_name || asset.title}</div>
          {tagline && <div className="text-[11px] italic text-white/70 line-clamp-3">"{tagline}"</div>}
        </div>
        <div className="flex gap-1 text-[9px] uppercase tracking-wider text-white/50">
          {g?.mission && <span>Mission</span>}
          {g?.vision && <span>· Vision</span>}
          {g?.values?.length ? <span>· Values</span> : null}
        </div>
      </div>
    );
  }
  if (at === "launch_copy") {
    const l = tryJson<LaunchCopyData>(asset.content || "");
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-brand/10 via-white to-neutral-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand">Launch Copy</div>
        <div className="space-y-1.5">
          {l?.hero?.headline && <div className="text-base font-semibold leading-tight text-neutral-900 line-clamp-2">{l.hero.headline}</div>}
          {l?.hero?.subheadline && <div className="text-[11px] text-neutral-600 line-clamp-2">{l.hero.subheadline}</div>}
          {!l?.hero?.headline && l?.tagline && <div className="text-base font-semibold text-neutral-900 line-clamp-3">{l.tagline}</div>}
        </div>
        {l?.hero?.cta && <div className="inline-flex w-fit rounded-full bg-brand px-2.5 py-1 text-[10px] font-medium text-brand-foreground">{l.hero.cta}</div>}
      </div>
    );
  }
  if (at === "product_hunt_copy") {
    const p = tryJson<ProductHuntCopyData>(asset.content || "");
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-orange-50 to-white p-4">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">P</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">Product Hunt</div>
        </div>
        <div className="space-y-1">
          {p?.tagline && <div className="text-sm font-semibold leading-tight text-neutral-900 line-clamp-2">{p.tagline}</div>}
          {p?.short_description && <div className="text-[11px] text-neutral-600 line-clamp-3">{p.short_description}</div>}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-400">Tagline · Comment · FAQ</div>
      </div>
    );
  }
  if (at === "social_post") {
    const s = tryJson<SocialPostData>(asset.content || "");
    const post = s && "kind" in s && s.kind === "post" ? s : null;
    const lib = s && "kind" in s && s.kind === "library" ? s : null;
    const sample = post?.copy || lib?.categories?.[0]?.posts?.[0]?.copy;
    const platform = post?.platform || lib?.categories?.[0]?.posts?.[0]?.platform || "Social";
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{platform}</div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-snug text-neutral-800 line-clamp-6">
          {sample || "Social post"}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-400">Post</div>
      </div>
    );
  }
  if (at === "founder_bio") {
    const b = tryJson<FounderBio>(asset.content || "");
    const sample = b?.short || b?.x_bio || b?.linkedin_headline || b?.medium;
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-neutral-50 to-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Founder Bio</div>
        <div className="flex items-start gap-2">
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-brand to-brand/60" />
          <div className="text-[11px] leading-snug text-neutral-700 line-clamp-5">{sample || "Bio"}</div>
        </div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-400">X · LinkedIn · Press</div>
      </div>
    );
  }
  if (at === "presentation") {
    const d = tryJson<PresentationData>(asset.content || "");
    const slides = d?.slides?.slice(0, 3) || [];
    return (
      <div className="flex aspect-square w-full flex-col justify-center gap-2 bg-neutral-100 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Deck · {d?.slides?.length || 0} slides</div>
        <div className="space-y-1.5">
          {slides.map((s, i) => (
            <div key={i} className="flex aspect-[16/9] w-full items-center justify-center rounded border border-neutral-200 bg-white px-2 text-center">
              <div className="text-[9px] font-medium text-neutral-700 line-clamp-2">{s.title}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (at === "template") {
    const t = tryJson<TemplateLibraryData>(asset.content || "");
    const groups = t?.groups?.slice(0, 3) || [];
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-neutral-50 to-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Templates</div>
        <div className="space-y-1">
          {groups.map((g, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-neutral-100 px-2 py-1 text-[10px] text-neutral-700">
              <span className="truncate font-medium">{g.name}</span>
              <span className="text-neutral-400">{g.templates?.length || 0}</span>
            </div>
          ))}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-neutral-400">Library</div>
      </div>
    );
  }
  // Generic text-design fallback with a snippet from content
  const snippet = (asset.content || "").replace(/[{}\[\]"`#*_]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  if (snippet) {
    return (
      <div className="flex aspect-square w-full flex-col justify-between bg-gradient-to-br from-neutral-50 to-white p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{at.replace(/_/g, " ")}</div>
        <div className="text-[11px] leading-snug text-neutral-700 line-clamp-6">{snippet}</div>
      </div>
    );
  }
  return (
    <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100 p-4 text-center">
      <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">{at.replace(/_/g, " ")}</span>
    </div>
  );
}

const ASSET_CHIPS: { id: string; label: string; Icon: any; example: string; assetType?: string; promptPrefix?: string }[] = [
  { id: "brand_guidelines", label: "Brand Guidelines", Icon: FileText, example: "Brand guidelines for TryLaunch" },
  { id: "template", label: "Brand Templates", Icon: LayoutTemplate, example: "Brand templates for a developer-tools startup" },
  { id: "logo", label: "Logos", Icon: Sparkles, example: "A logo for TryLaunch — clean SaaS, blue accent" },
  { id: "color_system", label: "Colors", Icon: Palette, example: "Color system for a developer-tools brand" },
  { id: "font_system", label: "Fonts", Icon: Type, example: "Font pairing for a modern fintech brand" },
  { id: "brand_voice", label: "Brand Voice", Icon: Wand2, example: "Brand voice for a friendly indie dev tool" },
  { id: "photo", label: "Photos", Icon: Camera, example: "Product photos for a Mac productivity app" },
  { id: "components", label: "Components", Icon: Layers, assetType: "graphic", promptPrefix: "UI component set with buttons, cards, inputs, navigation, and states. ", example: "UI component set for a fintech dashboard" },
  { id: "graphic", label: "Graphics", Icon: ImageIcon, example: "Hero banner for a Mac productivity app" },
  { id: "icon", label: "Icons", Icon: Shapes, example: "Icon set for a developer-tools startup" },
  { id: "launch_copy", label: "Launch Copy", Icon: RocketIcon, example: "Landing page launch copy for trylaunch.ai" },
  { id: "product_hunt_copy", label: "PH Copy", Icon: RocketIcon, example: "Product Hunt copy for trylaunch.ai" },
  { id: "social_post", label: "Social Post", Icon: Megaphone, example: "X thread announcing trylaunch.ai launch" },
];

type WF = "auto" | "brand" | "design" | "launch" | "promote";
const WORKFLOWS: { id: WF; label: string; Icon: any; hint: string }[] = [
  { id: "auto", label: "Auto-detect", Icon: Wand, hint: "Rocket picks the specialist and generates a full option gallery" },
  { id: "brand", label: "Brand It", Icon: Sparkles, hint: "Full galleries for logos, colors, fonts, and voice" },
  { id: "design", label: "Design It", Icon: Paintbrush, hint: "Full logo gallery + color system gallery" },
  { id: "launch", label: "Launch It", Icon: Send, hint: "Launch copy + PH copy + social" },
  { id: "promote", label: "Promote It", Icon: Radio, hint: "3 social posts + founder bio" },
];
const WORKFLOW_PLAN: Record<Exclude<WF, "auto">, { asset_type: string; count?: number }[]> = {
  brand: [{ asset_type: "logo" }, { asset_type: "color_system" }, { asset_type: "font_system" }, { asset_type: "brand_voice" }],
  design: [{ asset_type: "logo" }, { asset_type: "color_system" }],
  launch: [{ asset_type: "launch_copy" }, { asset_type: "product_hunt_copy" }, { asset_type: "social_post" }],
  promote: [{ asset_type: "social_post" }, { asset_type: "social_post" }, { asset_type: "social_post" }, { asset_type: "founder_bio" }],
};

function isLogotypeOnlyPrompt(text: string) {
  const lower = text.toLowerCase();
  const wantsTextLogo = /\b(logotype|logotypes|wordmark|word\s*mark|word-mark|text[- ]?based\s+logo|text\s+logo|type[- ]?based\s+logo|typographic\s+logo|typography\s+logo|lettering|letters\s+only|name\s+only)\b/.test(lower);
  const saysTextNotLogo = /\b(text|type|typographic|typography|lettering|wordmark|logotype)\b[\s\S]{0,40}\b(not\s+(a\s+)?logo|no\s+(logo|icon|symbol|mark)|not\s+(an\s+)?icon|not\s+(a\s+)?symbol)\b/.test(lower)
    || /\b(not\s+(a\s+)?logo|no\s+(logo|icon|symbol|mark)|not\s+(an\s+)?icon|not\s+(a\s+)?symbol)\b[\s\S]{0,40}\b(text|type|typographic|typography|lettering|wordmark|logotype)\b/.test(lower);
  const wantsLogoMark = /\b(logo|logos|logo mark|logomark|brandmark|mark|symbol)\b/.test(lower);
  const wantsPictorial = /\b(icon|symbol|emblem|pictorial|illustration|graphic|mascot|badge|app\s*icon|favicon)\b/.test(lower);
  const wantsBothLogoAndLogotype = wantsTextLogo && wantsLogoMark && /\b(and|plus|with|along with|as well as|also)\b/.test(lower);
  return (wantsTextLogo || saysTextNotLogo) && !wantsPictorial && !wantsBothLogoAndLogotype;
}

function isMixedLogoAndLogotypePrompt(text: string) {
  const lower = text.toLowerCase();
  const wantsTextLogo = /\b(logotype|logotypes|wordmark|word\s*mark|word-mark|text[- ]?based\s+logo|text\s+logo|type[- ]?based\s+logo|typographic\s+logo|typography\s+logo|lettering)\b/.test(lower);
  const wantsLogoMark = /\b(logo|logos|logo mark|logomark|brandmark|mark|symbol)\b/.test(lower);
  return wantsTextLogo && wantsLogoMark && /\b(and|plus|with|along with|as well as|also|matching)\b/.test(lower);
}

function normalizeMixedLogoPrompt(text: string, brandText?: string, url?: string) {
  if (!isMixedLogoAndLogotypePrompt(text)) return text;
  const resolvedBrand = brandText || pickLogotypeText({ prompt: text, url });
  if (resolvedBrand) return `Create a logo for ${resolvedBrand}`;
  if (url) return `Create a logo for ${url}`;
  return text.replace(/\b(and|plus|with|along with|as well as|also|matching)\b[\s\S]{0,40}\b(logotype|logotypes|wordmark|word\s*mark|word-mark)\b/gi, "").replace(/\s+/g, " ").trim();
}

const MIN_PROMPT_RESULTS = 12;
const IMAGE_ASSET_TYPES = new Set(["logo", "graphic", "icon", "photo"]);
const SAFE_IMAGE_BATCH_SIZE = 2;

function requestedCount(text: string, fallback = MIN_PROMPT_RESULTS) {
  const lower = text.toLowerCase();
  const words: Record<string, number> = { "a couple": 2, couple: 2, "a few": 3, few: 3, several: 4, handful: 5, "half a dozen": 6, "half dozen": 6, "a dozen": 12, dozen: 12, twelve: 12, "two dozen": 24 };
  for (const [word, n] of Object.entries(words)) if (lower.includes(word)) return n;
  const digit = text.match(/\b(\d{1,2})\b/);
  return digit ? Math.max(1, Math.min(24, Number(digit[1]))) : fallback;
}

function splitBatchCounts(total: number, maxBatchSize: number) {
  const batches: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const next = Math.min(remaining, maxBatchSize);
    batches.push(next);
    remaining -= next;
  }
  return batches;
}

// Specialized Design templates: pre-canned visual prompt scaffolds.
// Each chip prepends a vivid format-specific style header to the user's prompt
// and forces asset_type=graphic so the generator goes through image generation.
type DesignTemplate = {
  id: string;
  label: string;
  ratio: string;
  scaffold: (p: string) => string;
};
const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "hero",
    label: "Hero (16:9)",
    ratio: "1920x1080",
    scaffold: (p) => `Hero banner image, 16:9 widescreen (1920x1080), bold, modern, high-contrast, marketing-grade composition with clear focal point and editorial negative space. Subject: ${p}. Clean background, no text overlay.`,
  },
  {
    id: "og",
    label: "OG image (1200×630)",
    ratio: "1200x630",
    scaffold: (p) => `Open Graph social share image, 1200x630, eye-catching, brand-forward, centered composition optimized for link previews. Subject: ${p}. Crisp, no text overlay (text added separately).`,
  },
  {
    id: "yt",
    label: "YouTube thumbnail",
    ratio: "1280x720",
    scaffold: (p) => `YouTube thumbnail, 1280x720, ultra eye-catching, vibrant saturated colors, dramatic lighting, bold subject in left or center third, leaving space for thumbnail text. Subject: ${p}. No text overlay.`,
  },
];

const MESSAGES = [
  "Understanding your brand…",
  "Scraping context…",
  "Creating your designs…",
  "Generating…",
  "Saving design…",
];

function formatPromptTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  if (isYesterday) return `Yesterday · ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString([], sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
  return `${date} · ${time}`;
}

async function createChatRecord({
  supabase,
  userId,
  title,
  prompt,
  workspaceId,
}: {
  supabase: any;
  userId: string;
  title: string;
  prompt: string;
  workspaceId?: string | null;
}) {
  const { data, error } = await supabase
    .from("chats")
    .insert({ user_id: userId, title, prompt, workspace_id: workspaceId ?? null } as any)
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(error?.message || "Failed to create chat");
  return data.id as string;
}

const Generate = () => {
  const [params] = useSearchParams();
  const [prompt, setPrompt] = useState(params.get("prompt") ?? "");
  const [assetType, setAssetType] = useState<string | null>(params.get("asset_type"));
  const [workflow, setWorkflow] = useState<WF>((params.get("workflow") as WF) || "auto");
  const [template, setTemplate] = useState<string | null>(null);
  const [count, setCount] = useState<number>(MIN_PROMPT_RESULTS);
  const projectId = params.get("project");
  const chatId = params.get("chat");
  const directionId = params.get("direction");
  const [loading, setLoading] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [outOfCredits, setOutOfCredits] = useState<{ needed?: number; remaining?: number } | null>(null);
  const [chatData, setChatData] = useState<any>(null);
  const [chatAssets, setChatAssets] = useState<any[]>([]);
  const [directionDesign, setDirectionDesign] = useState<any>(null);
  const [projectBrandContext, setProjectBrandContext] = useState<any>(null);
  const [ignoreSavedStyle, setIgnoreSavedStyle] = useState(false);
  const [resultsView, setResultsView] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("rocket.generate.view") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  useEffect(() => { try { localStorage.setItem("rocket.generate.view", resultsView); } catch {} }, [resultsView]);
  const [pendingPrompt, setPendingPrompt] = useState<{ text: string; at: string } | null>(null);
  const [pendingPrompts, setPendingPrompts] = useState<{ text: string; at: string }[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const autoRan = useRef(false);

  const generationReturnPath = () => {
    const from = params.get("from");
    if (from && /^\/(logos|icons|wizard|templates|saved)$/.test(from)) return from;
    const currentType = params.get("asset_type") || assetType;
    return currentType === "icon" ? "/icons" : "/logos";
  };

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % MESSAGES.length), 1800);
    return () => clearInterval(t);
  }, [loading]);

  // Load chat + its assets when viewing an existing chat
  useEffect(() => {
    if (!chatId || !user) { setChatData(null); setChatAssets([]); return; }
    (async () => {
      const { data: c } = await supabase.from("chats").select("*").eq("id", chatId).maybeSingle();
      setChatData(c || null);
      const { data: a } = await supabase
        .from("assets")
        .select("id,title,asset_type,image_url,thumbnail_url,content,prompt,editor_state,meta,source_url,created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      setChatAssets(a || []);
    })();
  }, [chatId, user]);

  useEffect(() => {
    if (!projectId || !user) { setProjectBrandContext(null); return; }
    let cancelled = false;
    (async () => {
      const [projectResult, assetsResult] = await Promise.all([
        supabase.from("projects").select("id,name").eq("id", projectId).eq("user_id", user.id).maybeSingle(),
        supabase.from("assets").select("asset_type,content,image_url,thumbnail_url,created_at").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: true }),
      ]);
      if (!cancelled) setProjectBrandContext(projectResult.data ? buildProjectBrandContext(projectResult.data, assetsResult.data || []) : null);
    })();
    return () => { cancelled = true; };
  }, [projectId, user]);

  useEffect(() => {
    if (!user || ignoreSavedStyle) { setDirectionDesign(null); return; }
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("assets")
        .select("id,title,asset_type,prompt,meta,source_url,project_id,image_url,thumbnail_url")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (directionId) {
        query = query.eq("id", directionId);
      } else {
        query = query
          .contains("meta", { selected_as_direction: true })
          .order("created_at", { ascending: false })
          .limit(1);
        if (projectId) query = query.eq("project_id", projectId);
      }

      const { data } = await query.maybeSingle();
      if (!cancelled) setDirectionDesign(data || null);
    })();
    return () => { cancelled = true; };
  }, [directionId, ignoreSavedStyle, projectId, user]);

  const activeBrandCtx = (() => {
    if (projectBrandContext) return projectBrandContext;
    const direct = chatData?.brand_context;
    if (direct && (direct.productName || direct.url || direct.colors?.length || direct.logo)) return direct;
    const recent = [...chatAssets].reverse().find((a) => {
      const ctx = a?.meta?.brand_context;
      return ctx && (ctx.productName || ctx.url || ctx.colors?.length || ctx.logo || a.source_url);
    });
    return recent ? { ...(recent.meta?.brand_context || {}), url: recent.meta?.brand_context?.url || recent.source_url || undefined } : null;
  })();

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = prompt.trim();
    if (!p || !user) return;
    setLoading(true);
    setMsgIdx(0);
    const submittedAt = new Date().toISOString();
    if (chatId) setPendingPrompts((prev) => [...prev, { text: p, at: submittedAt }]);
    else setPendingPrompt({ text: p, at: submittedAt });
    try {
      // When generating into an existing chat, still create a new chat row if needed? No — reuse the same chat.
      let newChatId = chatId || null;
      // Selected chip can override raw asset type and optionally prepend a stronger prompt scaffold
      const selectedChip = ASSET_CHIPS.find(c => c.id === assetType) || null;
      const tpl = DESIGN_TEMPLATES.find(t => t.id === template) || null;
      const effectiveAssetType = tpl ? "graphic" : (selectedChip?.assetType || assetType || undefined);
      const effectivePrompt = tpl
        ? tpl.scaffold(p)
        : selectedChip?.promptPrefix
          ? `${selectedChip.promptPrefix}${p}`
          : p;
      const brandKitPrompt = getBrandKitInstruction(activeBrandCtx);
      const directedPrompt = [
        effectivePrompt,
        brandKitPrompt,
        directionDesign ? getDirectionInstruction(directionDesign) : "",
      ].filter(Boolean).join("\n\n");
      const effective = workflow;
      let allIds: string[] = [];
      let creditsErr: any = null;
      let effectiveProjectId: string | null = projectId || null;
      if (!newChatId) {
        const title = (() => {
          const explicitUrl = p.match(/(https?:\/\/\S+|\b[\w-]+\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b)/i)?.[1];
          if (explicitUrl) {
            const cleaned = explicitUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
            return `A ${effectiveAssetType || "brand design"} for ${cleaned}`;
          }
          if (effectiveAssetType === "logo") return p.length > 72 ? `${p.slice(0, 72).trim()}…` : p;
          return p.length > 72 ? `${p.slice(0, 72).trim()}…` : p;
        })();
        const { ensureActiveWorkspaceId } = await import("@/lib/workspace");
        const workspace_id = await ensureActiveWorkspaceId();
        // Auto-create a project for this chat if one isn't already attached
        if (!effectiveProjectId) {
          const projectName = (() => {
            const explicitUrl = p.match(/(https?:\/\/\S+|\b[\w-]+\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b)/i)?.[1];
            if (explicitUrl) {
              const cleaned = explicitUrl.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
              return cleaned;
            }
            return p.length > 60 ? `${p.slice(0, 60).trim()}…` : p;
          })();
          try {
            const { data: proj } = await supabase
              .from("projects")
              .insert({ user_id: user.id, workspace_id, name: projectName } as any)
              .select("id")
              .single();
            if (proj?.id) effectiveProjectId = proj.id as string;
          } catch { /* non-fatal */ }
        }
        newChatId = await createChatRecord({
          supabase,
          userId: user.id,
          title,
          prompt: p,
          workspaceId: workspace_id,
        });
        // Ensure downstream inserts get project_id too
        if (effectiveProjectId && !projectId) {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("project", effectiveProjectId);
            window.history.replaceState({}, "", url.toString());
          } catch { /* noop */ }
        }
      }
      if (chatId && newChatId) {
        await supabase
          .from("chats")
          .update({ updated_at: submittedAt })
          .eq("id", newChatId)
          .eq("user_id", user.id);
      }
      // Best-effort brand context: saved project → URL in prompt → recent design context.
      let persistedProject: any = null;
      if (effectiveProjectId) {
        try {
          const { data: project } = await supabase
            .from("projects")
            .select("name")
            .eq("id", effectiveProjectId)
            .maybeSingle();
          persistedProject = project || null;
        } catch { /* noop */ }
      }

      let sharedCtx: any = activeBrandCtx || null;
      if (sharedCtx || persistedProject?.name) {
        sharedCtx = {
          ...(sharedCtx || {}),
          productName: sharedCtx?.productName || persistedProject?.name || undefined,
          url: sharedCtx?.url || undefined,
        };
      }
      const urlMatch = p.match(/(https?:\/\/\S+|\b[\w-]+\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)(?:\/\S*)?)/i);
      if (urlMatch) {
        const u = /^https?:\/\//i.test(urlMatch[1]) ? urlMatch[1] : "https://" + urlMatch[1];
        try {
          const { data: scraped } = await supabase.functions.invoke("scrape-url", { body: { url: u } });
          if (scraped && !scraped.error) sharedCtx = { ...sharedCtx, ...scraped, url: u };
          else sharedCtx = { ...sharedCtx, url: u };
        } catch { sharedCtx = { ...sharedCtx, url: u }; }
      }
      if (!sharedCtx && chatAssets.length) {
        const recentWithContext = [...chatAssets].reverse().find((asset) => {
          const ctx = asset?.meta?.brand_context;
          return ctx && (ctx.productName || ctx.url || ctx.colors?.length || ctx.logo || asset.source_url);
        });
        if (recentWithContext) {
          sharedCtx = {
            ...(recentWithContext.meta?.brand_context || {}),
            url: recentWithContext.meta?.brand_context?.url || recentWithContext.source_url || undefined,
          };
        }
      }
      if (directionDesign) {
        const directionContext = directionDesign.meta?.brand_context || directionDesign.meta?.brandContext || {};
        sharedCtx = {
          ...directionContext,
          ...(sharedCtx || {}),
          selected_direction: {
            id: directionDesign.id,
            title: directionDesign.title,
            asset_type: directionDesign.asset_type,
            image_url: directionDesign.thumbnail_url || directionDesign.image_url || undefined,
            prompt: directionDesign.prompt || undefined,
          },
        };
      }
      if (effectiveProjectId) {
        const projectContext = {
          ...(sharedCtx || {}),
          productName: sharedCtx?.productName || persistedProject?.name || undefined,
          url: sharedCtx?.url || undefined,
        };
        sharedCtx = projectContext;
      }
      if (!tpl && isLogotypeOnlyPrompt(p)) {
        const priorPromptText = [p, chatData?.prompt, ...[...chatAssets].reverse().map((asset) => asset.prompt)].filter(Boolean).join("\n");
        const brandText = pickLogotypeText({
          prompt: priorPromptText,
          productName: sharedCtx?.productName,
          url: sharedCtx?.url,
        });
        if (!brandText) {
          throw new Error("I need a brand name or URL to create a wordmark.");
        }
        const variants = buildLogotypeVariants(brandText, Math.max(requestedCount(p, MIN_PROMPT_RESULTS), MIN_PROMPT_RESULTS), sharedCtx?.colors?.[0], sharedCtx?.fonts || []);
        const { ensureActiveWorkspaceId: _e2 } = await import("@/lib/workspace");
        const _wid = await _e2();
        const rows = variants.map((state, i) => ({
          user_id: user!.id,
          workspace_id: _wid,
          project_id: effectiveProjectId || null,
          asset_type: "logo",
          title: variants.length > 1 ? `Logotype ${i + 1}` : "Logotype",
          prompt: p,
          source_url: sharedCtx?.url || null,
          editor_state: state,
          meta: { brand_context: sharedCtx, kind: "logotype", variant: i + 1, of: variants.length },
        }));
        const { data, error } = await supabase.from("assets").insert(rows as any).select("id");
        if (error) throw new Error(error.message);
        allIds = (data || []).map((row: any) => row.id);
        if (allIds.length) {
          window.dispatchEvent(new CustomEvent("rocket:notify", { detail: {
            kind: "asset",
            title: allIds.length === 1 ? "Logotype ready" : `${allIds.length} logotypes ready`,
            body: sharedCtx?.productName ? `Generated for ${sharedCtx.productName}.` : "Available in your designs.",
            href: allIds[0] ? `/editor?id=${allIds[0]}` : "/designs",
          }}));
        }
      } else if (tpl || effective === "auto") {
        const backendPrompt = normalizeMixedLogoPrompt(
          directedPrompt,
          pickLogotypeText({ prompt: p, productName: sharedCtx?.productName, url: sharedCtx?.url }),
          sharedCtx?.url,
        );
        const workspace_id = (await import("@/lib/workspace")).getActiveWorkspaceIdSync() ?? undefined;
        const requestBodyBase = {
          prompt: backendPrompt,
          asset_type: effectiveAssetType,
          project_id: effectiveProjectId || undefined,
          brand_context: sharedCtx || undefined,
          workspace_id,
          requested_lockup: isMixedLogoAndLogotypePrompt(p),
        };
        const requestedImageCount = effectiveAssetType && !tpl ? count : undefined;
        const shouldBatchImageRequest =
          !!requestedImageCount &&
          !!effectiveAssetType &&
          IMAGE_ASSET_TYPES.has(effectiveAssetType) &&
          requestedImageCount > SAFE_IMAGE_BATCH_SIZE;

        if (shouldBatchImageRequest) {
          let partialErrorMessage: string | null = null;
          for (const batchCount of splitBatchCounts(requestedImageCount, SAFE_IMAGE_BATCH_SIZE)) {
            const { data, error } = await supabase.functions.invoke("generate-asset", {
              body: { ...requestBodyBase, count: batchCount },
            });
            const d: any = data;
            const aiErr = handleAiError(d, error, toast);
            if (aiErr?.kind === "no_credits") {
              if (allIds.length === 0) {
                setOutOfCredits({ needed: aiErr.needed, remaining: aiErr.remaining });
                return;
              }
              partialErrorMessage = aiErr.message;
              break;
            }
            if (aiErr) {
              if (allIds.length === 0) return;
              partialErrorMessage = aiErr.message;
              break;
            }
            if (d?.refused) {
              if (allIds.length === 0) {
                toast({ title: "Out of scope", description: d.message });
                return;
              }
              partialErrorMessage = d.message || "Rocket stopped before finishing every batch.";
              break;
            }
            if (d?.asset_ids?.length) allIds.push(...d.asset_ids);
          }
          if (partialErrorMessage && allIds.length) {
            toast({
              title: "Partial result",
              description: `Created ${allIds.length} designs before Rocket hit an error. ${partialErrorMessage}`,
            });
          }
        } else {
          const { data, error } = await supabase.functions.invoke("generate-asset", {
            body: { ...requestBodyBase, count: requestedImageCount },
          });
          const d: any = data;
          const aiErr = handleAiError(d, error, toast);
          if (aiErr?.kind === "no_credits") {
            setOutOfCredits({ needed: aiErr.needed, remaining: aiErr.remaining });
            return;
          }
          if (aiErr) return;
          if (d?.refused) { toast({ title: "Out of scope", description: d.message }); return; }
          allIds = d.asset_ids || [];
        }
      } else {
        // Workflow fan-out: parallel generate-asset calls
        const plan = WORKFLOW_PLAN[effective as Exclude<WF, "auto">];
        const { getActiveWorkspaceIdSync } = await import("@/lib/workspace");
        const _wsid = getActiveWorkspaceIdSync() || undefined;
        const results = await Promise.all(plan.map(step =>
          supabase.functions.invoke("generate-asset", {
            body: { prompt: directedPrompt, asset_type: step.asset_type, count: step.count, project_id: effectiveProjectId || undefined, brand_context: sharedCtx || undefined, workspace_id: _wsid },
          })
        ));
        for (const r of results) {
          const d: any = r.data;
          if (d?.error === "no_credits") { creditsErr = d; continue; }
          if (d?.error === "rate_limit" || d?.error === "ai_provider_unavailable") {
            handleAiError(d, null, toast);
            continue;
          }
          if (d?.asset_ids?.length) allIds.push(...d.asset_ids);
        }
      }
      if (allIds.length === 0 && creditsErr) {
        setOutOfCredits({ needed: creditsErr.needed, remaining: creditsErr.remaining });
        return;
      }
      if (allIds.length === 0) {
        throw new Error("No designs generated");
      }
      if (creditsErr) toast({ title: "Partial result", description: "Ran out of credits before finishing the workflow." });
      // Link generated assets to this chat
      await supabase.from("assets").update({ chat_id: newChatId, prompt: p }).in("id", allIds);
      window.dispatchEvent(new Event("chats:refresh"));
      window.dispatchEvent(new Event("credits:refresh"));
      track("asset_generated", {
        count: allIds.length,
        workflow: effective,
        asset_type: effectiveAssetType || undefined,
        has_context: !!sharedCtx,
      });
      window.dispatchEvent(new CustomEvent("rocket:notify", { detail: {
        kind: "asset",
        title: allIds.length === 1 ? "New design generated" : `${allIds.length} designs generated`,
        body: `From: "${p.slice(0, 80)}${p.length > 80 ? "…" : ""}"`,
        href: allIds[0] ? `/editor?id=${allIds[0]}` : "/designs",
      }}));
      setPrompt("");
      if (chatId) {
        // Already in this chat — refresh assets in place so the new prompt appears in history.
        const { data: a } = await supabase
          .from("assets")
            .select("id,title,asset_type,image_url,thumbnail_url,content,prompt,editor_state,meta,source_url,created_at")
          .eq("chat_id", newChatId)
          .order("created_at", { ascending: true });
        setChatAssets(a || []);
        setPendingPrompts([]);
        setPendingPrompt(null);
      } else {
        nav(`/create?chat=${newChatId}`);
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveToSaved = async (designId: string) => {
    if (!user) return;
    const { data: chosen, error: chosenError } = await supabase
      .from("assets")
      .select("id,project_id,meta,asset_type,title")
      .eq("id", designId)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (chosenError || !chosen) {
      toast({ title: "Could not save", description: chosenError?.message || "Design not found.", variant: "destructive" });
      return;
    }
    const { error: updateError } = await supabase.from("assets").update({
      meta: {
        ...(chosen.meta || {}),
        saved_at: new Date().toISOString(),
        saved_from_chat: true,
      },
    }).eq("id", chosen.id);
    if (updateError) {
      toast({ title: "Could not save", description: updateError.message, variant: "destructive" });
      return;
    }
    setChatAssets((prev) => prev.map((x) => x.id === chosen.id ? { ...x, meta: { ...(x.meta || {}), saved_at: new Date().toISOString(), saved_from_chat: true } } : x));
    toast({ title: "Saved", description: "Added to Saved." });
    window.dispatchEvent(new CustomEvent("rocket:notify", { detail: {
      kind: "asset",
      title: "Logo saved",
      body: chosen.title || "Added to Saved.",
      href: "/saved",
    }}));
  };

  useEffect(() => {
    if (!chatId && !params.get("prompt")) {
      nav(generationReturnPath(), { replace: true });
      return;
    }
    if (autoRan.current) return;
    if (params.get("prompt") && user) {
      autoRan.current = true;
      (async () => {
        await submit();
        // If generation failed (busy/rate-limited/etc.) and we never landed in
        // a chat, bounce back to the referring designer screen (e.g. /logos,
        // /icons) rather than stranding the user on the empty "Create a
        // design" hub.
        if (typeof window !== "undefined") {
          const currentParams = new URLSearchParams(window.location.search);
          const succeeded = !!currentParams.get("chat");
          if (!succeeded) {
            nav(generationReturnPath(), { replace: true });
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isChatView = !!(chatId && chatData) || (loading && !!pendingPrompt);
  // Build the ordered list of user prompts in this chat: start with chat.prompt,
  // then append unique prompts from assets in creation order, then any pending prompts
  // currently being generated. Falls back to the live pendingPrompt if there's no chat yet.
  const promptHistory: { text: string; at: string | null }[] = (() => {
    const list: { text: string; at: string | null }[] = [];
    const push = (s?: string | null, at?: string | null) => {
      const v = (s || "").trim();
      if (!v) return;
      if (list[list.length - 1]?.text === v) return;
      list.push({ text: v, at: at || null });
    };
    push(chatData?.prompt, chatData?.created_at);
    for (const a of chatAssets) push(a.prompt, a.created_at);
    for (const p of pendingPrompts) push(p.text, p.at);
    if (list.length === 0 && pendingPrompt) push(pendingPrompt.text, pendingPrompt.at);
    return list;
  })();
  return (
    <div className={`flex min-h-[calc(100vh-4rem)] w-full flex-col ${isChatView ? "px-5 py-5 lg:px-8" : "mx-auto max-w-5xl items-center px-5 py-8 sm:px-8"}`}>
      {chatId && !chatData ? (
        <div className="flex min-h-[40vh] w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : isChatView ? (
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* Left: chat panel */}
          <div className="flex h-[calc(100vh-8rem)] flex-col lg:sticky lg:top-20">
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto">
              {promptHistory.map((p, i) => {
                const isLast = i === promptHistory.length - 1;
                const matchCount = chatAssets.filter((a) => (a.prompt || "").trim() === p.text).length;
                const showLoading = isLast && loading;
                const replyText = showLoading
                  ? MESSAGES[msgIdx]
                  : matchCount > 0
                    ? `Found ${matchCount} result${matchCount === 1 ? "" : "s"}. See the results panel.`
                    : isLast && chatAssets.length === 0
                      ? "No designs yet."
                      : "Done. See the results panel.";
                return (
                  <div key={i} className="space-y-3">
                    {/* User bubble — right */}
                    <div className="flex w-full flex-col items-end gap-1">
                      <div className="max-w-[85%] rounded-2xl bg-brand px-4 py-3 text-sm text-brand-foreground">
                        {p.text}
                      </div>
                      {p.at && (
                        <span className="px-2 text-[10px] text-neutral-400">
                          {formatPromptTime(p.at)}
                        </span>
                      )}
                    </div>
                    {/* Assistant bubble — left */}
                    <div className="flex w-full flex-col items-start gap-1">
                      <div className="flex max-w-[85%] items-center gap-2 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-800">
                        {showLoading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-500" />}
                        <span>{replyText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Composer pinned to bottom */}
            <form onSubmit={submit} className="mt-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask Rocket to create another design..."
                  rows={2}
                  disabled={loading}
                  className="w-full resize-none rounded-xl px-3 py-2 text-sm outline-none placeholder:text-neutral-400 disabled:opacity-60"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                />
                <div className="flex items-center justify-end px-2 pb-1">
                  <button
                    type="submit"
                    disabled={!prompt.trim() || loading}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-brand-foreground transition hover:bg-brand-hover disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-neutral-400">Enter to send · Shift+Enter for newline</p>
            </form>
          </div>

          {/* Right: results panel — Brandmark-style clean grid */}
          <div className="bg-transparent">
            {chatAssets.length === 0 ? (
              <p className="text-sm text-neutral-500">No designs yet.</p>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-end">
                  <div className="inline-flex items-center rounded-full border border-neutral-200 bg-white p-0.5 text-neutral-500">
                    <button
                      type="button"
                      onClick={() => setResultsView("list")}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${resultsView === "list" ? "bg-neutral-900 text-white" : "hover:text-neutral-900"}`}
                      title="List view"
                    >
                      <ListIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultsView("grid")}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${resultsView === "grid" ? "bg-neutral-900 text-white" : "hover:text-neutral-900"}`}
                      title="Grid view"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" /> Grid
                    </button>
                  </div>
                </div>
                <div className={resultsView === "list" ? "flex flex-col gap-5" : "grid grid-cols-1 gap-5 md:grid-cols-2"}>
                  {chatAssets.map((a) => (
                    <div
                      key={a.id}
                      className="group relative overflow-hidden rounded-3xl bg-neutral-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-neutral-100 transition hover:shadow-[0_18px_50px_-24px_rgba(15,23,42,0.28)]"
                    >
                      <Link to={assetHref(a)} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-white">
                          <AssetCardThumb asset={a} />
                        </div>
                      </Link>
                      {/* Hover action bar — Brandmark style */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center pb-4 opacity-0 transition group-hover:opacity-100">
                        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-neutral-100">
                          <Link
                            to={assetHref(a)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            <Wand2 className="h-3.5 w-3.5" /> Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => { setPrompt(`Variants of "${a.title || "this design"}"`); }}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            <Layers className="h-3.5 w-3.5" /> Variants
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void saveToSaved(a.id); }}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            <Star className={`h-3.5 w-3.5 ${a?.meta?.saved_at ? "fill-amber-400 text-amber-400" : ""}`} /> {a?.meta?.saved_at ? "Saved" : "Save"}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                                title="More"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  const url = a.image_url || "";
                                  if (!url) return;
                                  const link = document.createElement("a");
                                  link.href = url;
                                  link.download = `${(a.title || "design").replace(/[^a-z0-9-_]+/gi, "-")}.png`;
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                }}
                              >
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(a.image_url || "");
                                    toast({ title: "Link copied" });
                                  } catch {}
                                }}
                              >
                                Copy image link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => { setPrompt(`Variants of "${a.title || "this design"}"`); }}
                              >
                                Generate variants
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void saveToSaved(a.id)}>
                                Save to Saved
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={async () => {
                                  if (!confirm("Delete this design?")) return;
                                  try {
                                    await supabase.from("assets").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
                                    setChatAssets((prev) => prev.filter((x) => x.id !== a.id));
                                    toast({ title: "Moved to Trash" });
                                  } catch (e: any) {
                                    toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
                                  }
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 text-sm text-neutral-500">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}

      <OutOfCreditsModal
        open={!!outOfCredits}
        onClose={() => setOutOfCredits(null)}
        needed={outOfCredits?.needed}
        remaining={outOfCredits?.remaining}
      />
    </div>
  );
};

export default Generate;
