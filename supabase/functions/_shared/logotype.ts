// Shared with frontend src/lib/logotype.ts — keep style cycle in sync.
export interface LogotypeState {
  kind: "logotype";
  text: string;
  font: string;
  weight: number;
  color: string;
  letterSpacing: number;
  transform: "none" | "uppercase" | "lowercase" | "capitalize";
}

type CanvasBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  visible: boolean;
  locked: boolean;
};

type CanvasImageEl = CanvasBase & {
  kind: "image";
  src: string;
};

type CanvasTextEl = CanvasBase & {
  kind: "text";
  text: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  align?: "left" | "center" | "right";
};

export type CanvasElement = CanvasImageEl | CanvasTextEl;

const GENERIC_BRAND_NAMES = new Set([
  "brand",
  "logo",
  "logotype",
  "wordmark",
  "word mark",
  "text logo",
  "startup",
  "company",
  "product",
  "real brand",
  "a real brand",
  "my brand",
  "my startup",
  "my company",
  "my product",
  "this brand",
  "this project",
  "the brand",
]);

const DOMAIN_PREFIXES = ["try", "get", "use", "join", "go"];

function titleCase(value: string): string {
  return value
    .split(/([\s-]+)/)
    .map((part) => (/^[a-z]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function applyTransform(text: string, transform: LogotypeState["transform"]): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return titleCase(text);
  return text;
}

function cleanDomainLabel(label: string): string | undefined {
  const raw = label.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!raw || raw.length < 2) return undefined;
  const prefix = DOMAIN_PREFIXES.find((p) => raw.startsWith(p) && raw.length - p.length >= 4);
  const withoutPrefix = prefix ? raw.slice(prefix.length) : raw;
  return titleCase(withoutPrefix.replace(/-/g, " ")).replace(/\s+/g, "").trim() || undefined;
}

const STYLES: Array<Partial<LogotypeState>> = [
  { font: "Space Grotesk", weight: 700, letterSpacing: -0.03, transform: "none" },
  { font: "Geist", weight: 600, letterSpacing: -0.02, transform: "lowercase" },
  { font: "Outfit", weight: 800, letterSpacing: -0.04, transform: "none" },
  { font: "Bricolage Grotesque", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "Instrument Serif", weight: 400, letterSpacing: -0.02, transform: "none" },
  { font: "Fraunces", weight: 600, letterSpacing: -0.03, transform: "none" },
  { font: "DM Serif Display", weight: 400, letterSpacing: -0.02, transform: "none" },
  { font: "Manrope", weight: 800, letterSpacing: -0.04, transform: "uppercase" },
  { font: "Syne", weight: 700, letterSpacing: 0, transform: "none" },
  { font: "Plus Jakarta Sans", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "IBM Plex Mono", weight: 500, letterSpacing: -0.04, transform: "lowercase" },
  { font: "JetBrains Mono", weight: 700, letterSpacing: -0.04, transform: "uppercase" },
  { font: "Hanken Grotesk", weight: 800, letterSpacing: -0.03, transform: "none" },
  { font: "Sora", weight: 700, letterSpacing: -0.02, transform: "none" },
  { font: "Figtree", weight: 700, letterSpacing: -0.02, transform: "lowercase" },
  { font: "Onest", weight: 700, letterSpacing: -0.03, transform: "none" },
  { font: "Playfair Display", weight: 700, letterSpacing: -0.01, transform: "none" },
  { font: "Spectral", weight: 600, letterSpacing: -0.01, transform: "none" },
  { font: "Crimson Pro", weight: 700, letterSpacing: -0.01, transform: "none" },
  { font: "Recursive", weight: 700, letterSpacing: -0.03, transform: "lowercase" },
];

export function normalizeLogotypeText(value?: string | null, urlHint?: string | null): string | undefined {
  if (!value) return extractNameFromUrl(urlHint || undefined);
  const fromUrl = extractNameFromUrl(value);
  if (fromUrl) return fromUrl;

  const urlFallback = extractNameFromUrl(urlHint || undefined);
  let text = String(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\.(com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b.*$/i, "")
    .split(/[|—–:]/)[0]
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .replace(/\b(logo|logotype|wordmark|brand assets?|brand kit|existing assets?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return urlFallback;
  if (text.length > 34 || text.split(/\s+/).length > 4) return urlFallback;
  if (GENERIC_BRAND_NAMES.has(text.toLowerCase())) return urlFallback;
  return titleCase(text);
}

export function extractNameFromPrompt(prompt: string, urlHint?: string | null): string | undefined {
  const fromUrl = extractNameFromUrl(prompt) || extractNameFromUrl(urlHint || undefined);
  if (fromUrl) return fromUrl;

  // Highest priority: explicit quoted brand name, or "say/read/spell X".
  // These are the user's unambiguous signals and must beat generic "for ..." matches
  // like "for a real brand" in surrounding descriptive copy.
  const explicit = [
    /(?:text\s+(?:to\s+)?(?:exactly\s+)?(?:say|read|spell)|should\s+(?:say|read|spell)|say|spell|reads?)\s*[:\-]?\s*['"“”‘’]([^'"“”‘’\n]{1,40})['"“”‘’]/i,
    /['"“”‘’]([A-Za-z][A-Za-z0-9 &.\-]{0,39})['"“”‘’]/,
    /(?:text\s+(?:to\s+)?(?:exactly\s+)?(?:say|read|spell)|should\s+(?:say|read|spell)|say|spell|reads?)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 &.\-]{0,39})\b/i,
  ];
  for (const pattern of explicit) {
    const match = prompt.match(pattern)?.[1];
    const cleaned = normalizeLogotypeText(match, urlHint);
    if (cleaned) return cleaned;
  }

  const patterns = [
    /\b(?:called|named|brand(?:ed)? as)\s+([A-Za-z][A-Za-z0-9 -]{1,40})\b/i,
    /\b([A-Za-z][A-Za-z0-9 -]{1,40})\s+(?:logotype|wordmark|word mark|text logo)\b/i,
    // "for X" is a weak signal — keep it last so it doesn't swallow generic phrases
    // like "for a real brand", "for my startup", "for this project" in descriptive copy.
    /\bfor\s+([A-Za-z][A-Za-z0-9 -]{1,40})\b/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern)?.[1];
    const cleaned = normalizeLogotypeText(match, urlHint);
    if (cleaned) return cleaned;
  }
  return undefined;
}

export function pickLogotypeText(input: { prompt?: string | null; productName?: string | null; url?: string | null; fallback?: string | null }): string | undefined {
  return (
    extractNameFromPrompt(input.prompt || "", input.url) ||
    normalizeLogotypeText(input.productName, input.url) ||
    normalizeLogotypeText(input.fallback, input.url) ||
    extractNameFromUrl(input.url || undefined)
  );
}

export function buildLogotypeVariants(text: string, count: number, brandColor?: string, brandFonts: string[] = []): LogotypeState[] {
  const color = brandColor && /^#[0-9a-f]{3,8}$/i.test(brandColor) ? brandColor : "#0a0a0a";
  const brandText = normalizeLogotypeText(text) || "Brand";
  const styles = [
    ...brandFonts
      .filter((font, index, arr) => !!font && arr.indexOf(font) === index)
      .slice(0, 3)
      .map((font) => ({ font, weight: 700, letterSpacing: -0.02, transform: "none" as const })),
    ...STYLES,
  ];
  const out: LogotypeState[] = [];
  for (let i = 0; i < count; i++) {
    const s = styles[i % styles.length];
    out.push({
      kind: "logotype",
      text: brandText,
      font: s.font || "Space Grotesk",
      weight: s.weight ?? 700,
      color,
      letterSpacing: s.letterSpacing ?? -0.02,
      transform: (s.transform as LogotypeState["transform"]) || "none",
    });
  }
  return out;
}

export function extractNameFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const inline = String(url).match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.(?:com|ai|io|co|app|dev|net|org|xyz|so|gg|me)\b/i)?.[1];
  if (inline) return cleanDomainLabel(inline);
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    return host ? cleanDomainLabel(host) : undefined;
  } catch { return undefined; }
}

export function buildLogoLockupEditorState(imageUrl: string, state: LogotypeState): CanvasElement[] {
  const lockupText = applyTransform(state.text, state.transform);
  const textWidth = Math.max(280, Math.min(420, Math.round(lockupText.length * 42)));
  const fontSize = lockupText.replace(/\s+/g, "").length > 14 ? 72 : lockupText.replace(/\s+/g, "").length > 10 ? 80 : 86;
  const iconSize = Math.round(fontSize * 1.35);
  const gap = Math.max(22, Math.round(fontSize * 0.32));
  const estimatedTextWidth = Math.min(textWidth, Math.max(240, Math.round(lockupText.length * fontSize * 0.54)));
  const totalWidth = iconSize + gap + estimatedTextWidth;
  const startX = Math.round((800 - totalWidth) / 2);
  const centerY = 300;
  return [
    {
      id: uid(),
      kind: "image",
      x: startX,
      y: Math.round(centerY - iconSize / 2),
      w: iconSize,
      h: iconSize,
      visible: true,
      locked: false,
      src: imageUrl,
    },
    {
      id: uid(),
      kind: "text",
      x: startX + iconSize + gap,
      y: Math.round(centerY - fontSize * 0.58),
      w: textWidth,
      h: Math.round(fontSize * 1.45),
      visible: true,
      locked: false,
      text: lockupText,
      color: state.color,
      fontSize,
      fontWeight: state.weight,
      fontFamily: state.font,
      align: "left",
    },
  ];
}
