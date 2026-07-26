import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { logotypeToPng, logotypeToSvg } from "@/components/Logotype";
import { defaultLogotypeState, type LogotypeState } from "@/lib/logotype";
import { loadBrandMeta } from "@/lib/brandMeta";
import {
  brandLogotypeToPng,
  canvasLogoLockupIconElements,
  canvasLogoLockupTextElements,
  isBrandKitLogotypeAsset,
  isCanvasLogoLockupAsset,
  logotypeStateFromAsset,
} from "@/lib/brandLogoAsset";
import { isCanvasAsset } from "@/lib/canvasAsset";
import { createArtworkPreviewFromImageUrl, createCanvasElementsPreview } from "@/lib/previewThumbnail";
import { pickLogoColor, isDarkBg, silhouetteImage, transparentLogo } from "@/lib/logoContrast";

type BrandKitDownloadArgs = {
  supabase: any;
  projectId: string;
  project?: any;
};

export type BrandKitDownloadResult = {
  included: number;
  skipped: string[];
  filename: string;
};

const LOGO_TYPES = new Set(["logo", "logotype", "wordmark", "brandmark", "icon", "app_icon", "favicon", "graphic", "photo", "image"]);

// ---------- Kit palette/font derivation (mirrors PaletteExplorer / FontExplorer) ----------

const normalizeHex = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(input.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 8) hex = hex.slice(0, 6);
  return `#${hex.toUpperCase()}`;
};

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
};

const isInkBucket = (c: { r: number; g: number; b: number }) => {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return (max + min) / 510 < 0.28 && sat < 0.35;
};

const shouldSamplePixel = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lightness = (max + min) / 510;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (isInkBucket({ r, g, b })) return true;
  if (lightness > 0.78 || lum > 0.9) return false;
  if (sat < 0.25) return false;
  return true;
};

type PaletteBucket = { r: number; g: number; b: number; count: number };

async function sampleImageBuckets(src: string): Promise<PaletteBucket[]> {
  const run = (img: HTMLImageElement): PaletteBucket[] => {
    try {
      const w = 128, h = 128;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return [];
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const buckets = new Map<string, PaletteBucket>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (!shouldSamplePixel(r, g, b)) continue;
        const key = isInkBucket({ r, g, b }) ? "ink" : `${r >> 4}-${g >> 4}-${b >> 4}`;
        const cur = buckets.get(key);
        if (cur) { cur.r += r; cur.g += g; cur.b += b; cur.count++; }
        else buckets.set(key, { r, g, b, count: 1 });
      }
      return Array.from(buckets.values());
    } catch { return []; }
  };
  try {
    const img = await loadImage(src);
    return run(img);
  } catch {
    try {
      const r = await fetch(src, { mode: "cors" });
      if (!r.ok) return [];
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      return run(img);
    } catch { return []; }
  }
}

function clusterBuckets(buckets: PaletteBucket[], maxColors = 6): string[] {
  const avg = buckets.map((b) => ({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count }));
  avg.sort((a, b) => b.count - a.count);
  const total = avg.reduce((s, b) => s + b.count, 0) || 1;
  const clusters: { r: number; g: number; b: number; count: number }[] = [];
  const d2 = (a: any, b: any) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  for (const p of avg) {
    const near = clusters.find((c) => d2(c, p) < 55 * 55);
    if (near) {
      const t = near.count + p.count;
      near.r = (near.r * near.count + p.r * p.count) / t;
      near.g = (near.g * near.count + p.g * p.count) / t;
      near.b = (near.b * near.count + p.b * p.count) / t;
      near.count = t;
    } else clusters.push({ ...p });
  }
  const kept = clusters.filter((c) => isInkBucket(c) ? c.count / total >= 0.0005 : c.count / total >= 0.005);
  kept.sort((a, b) => b.count - a.count);
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  const picked = kept.slice(0, maxColors);
  const ink = kept.find((c) => isInkBucket(c));
  if (ink && !picked.some((c) => isInkBucket(c))) {
    if (picked.length >= maxColors) picked[picked.length - 1] = ink;
    else picked.push(ink);
  }
  return picked.map((c) => isInkBucket(c) ? "#0A0A0A" : `#${to(c.r)}${to(c.g)}${to(c.b)}`.toUpperCase());
}

function collectStateColors(state: any, out: Set<string>) {
  const push = (v: unknown) => {
    const hex = normalizeHex(v);
    if (!hex) return;
    const rgb = hexToRgb(hex);
    if (!shouldSamplePixel(rgb.r, rgb.g, rgb.b)) return;
    out.add(isInkBucket(rgb) ? "#0A0A0A" : hex);
  };
  if (!state) return;
  if (state.kind === "logotype") { push(state.color); return; }
  if (Array.isArray(state)) for (const el of state) { push(el?.fill); push(el?.color); push(el?.stroke); push(el?.lineColor); }
}

function collectImageSources(asset: any): string[] {
  const editor = Array.isArray(asset?.editor_state)
    ? asset.editor_state.map((el: any) => el?.src).filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
    : [];
  const list = [asset?.image_url, asset?.thumbnail_url, asset?.meta?.preview_url, asset?.meta?.source_url, asset?.meta?.original_url, ...editor];
  return Array.from(new Set(list.filter((s): s is string => typeof s === "string" && s.length > 0)));
}

async function derivePaletteFromAssets(assets: any[], fallback: string[]): Promise<string[]> {
  const savedAssets = assets.filter((a: any) => a?.meta?.saved_at);
  const srcs = savedAssets.flatMap(collectImageSources);
  const buckets = (await Promise.all(srcs.map((s) => sampleImageBuckets(s).catch(() => [] as PaletteBucket[])))).flat();
  const stateColors = new Set<string>();
  savedAssets.forEach((a) => collectStateColors(a?.editor_state, stateColors));
  const derived = Array.from(new Set([...clusterBuckets(buckets, 6), ...stateColors]));
  return derived.length ? derived : fallback;
}

function fontFromState(state: any): string | null {
  if (!state) return null;
  if (state.kind === "logotype" && typeof state.font === "string" && state.font.trim()) return state.font.trim();
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

function deriveFontFromAssets(assets: any[], fallback: string): string {
  const saved = assets.filter((a: any) => a?.meta?.saved_at);
  saved.sort((a: any, b: any) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  for (const a of saved) {
    const f = fontFromState(a.editor_state);
    if (f) return f;
  }
  return fallback;
}

type SocialIconShape = "circle" | "rounded" | "square";

type SocialIconVariant = {
  key: string;
  shape: SocialIconShape;
  bg: string;
  fg: string;
};

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes(column.toLowerCase()) && (
    message.includes("column") || message.includes("schema cache") || message.includes("could not find")
  );
};

const safeFile = (s: string) =>
  String(s || "file").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80).toLowerCase() || "file";

const cleanHex = (value?: string | null, fallback = "#1676e3") => {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = "image/png") =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas export failed")), type);
  });

async function canvasToJpgBlob(canvas: HTMLCanvasElement, background = "#ffffff") {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return canvasToBlob(flat, "image/jpeg");
}

async function canvasToPsdBlob(canvas: HTMLCanvasElement, layerName = "Logo"): Promise<Blob> {
  const { writePsd } = await import("ag-psd");
  const bg = document.createElement("canvas");
  bg.width = canvas.width;
  bg.height = canvas.height;
  const bgCtx = bg.getContext("2d")!;
  bgCtx.fillStyle = "#ffffff";
  bgCtx.fillRect(0, 0, bg.width, bg.height);
  const psd = {
    width: canvas.width,
    height: canvas.height,
    canvas,
    children: [
      { name: "Background", canvas: bg },
      { name: layerName, canvas, left: 0, top: 0, right: canvas.width, bottom: canvas.height },
    ],
  } as any;
  const buffer = writePsd(psd);
  return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
}

function canvasToEmbeddedSvg(canvas: HTMLCanvasElement, title: string): string {
  const dataUrl = canvas.toDataURL("image/png");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><title>${title}</title><image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
}

async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || 1024;
  c.height = img.naturalHeight || 1024;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function addAllFormatsFromCanvas(
  folder: JSZip,
  folderName: string,
  base: string,
  canvas: HTMLCanvasElement,
  add: (folder: JSZip, folderName: string, name: string, data: string | Blob | ArrayBuffer) => void,
  nativeSvg?: string,
) {
  add(folder, folderName, `${base}.png`, await canvasToBlob(canvas));
  try { add(folder, folderName, `${base}.jpg`, await canvasToJpgBlob(canvas)); } catch {}
  try { add(folder, folderName, `${base}.psd`, await canvasToPsdBlob(canvas, base)); } catch {}
  const svgMarkup = nativeSvg || canvasToEmbeddedSvg(canvas, base);
  const svgBlob = () => new Blob([svgMarkup], { type: "image/svg+xml" });
  add(folder, folderName, `${base}.figma.svg`, svgBlob());
  add(folder, folderName, `${base}.sketch.svg`, svgBlob());
  add(folder, folderName, `${base}.canva.svg`, svgBlob());
}

const triggerDownload = (blob: Blob, filename: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};

async function fetchBytes(url: string): Promise<{ bytes: ArrayBuffer; ext: string } | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const bytes = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "";
    const fromPath = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url)?.[1]?.toLowerCase();
    const ext = ct.includes("svg") ? "svg"
      : ct.includes("jpeg") ? "jpg"
      : ct.includes("webp") ? "webp"
      : ct.includes("png") ? "png"
      : fromPath && ["svg", "jpg", "jpeg", "webp", "png"].includes(fromPath) ? (fromPath === "jpeg" ? "jpg" : fromPath)
      : "png";
    return { bytes, ext };
  } catch {
    return null;
  }
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

async function buildImageVariantBlob(url: string, variant: "regular" | "inverse" | "black") {
  const img = await loadImage(url);
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if (variant !== "regular") {
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = variant === "inverse" ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }
  return canvasToBlob(canvas);
}

const buildSocialIconVariants = (brandColor: string): SocialIconVariant[] => {
  const neutral = "#E5E7EB";
  const onBrand = pickLogoColor(neutral);
  const onLightPaper = isDarkBg(brandColor) ? brandColor : "#0A0A0A";
  return [
    { key: "circle-brand", shape: "circle", bg: neutral, fg: onBrand },
    { key: "circle-white", shape: "circle", bg: "#FFFFFF", fg: onLightPaper },
    { key: "circle-black", shape: "circle", bg: "#0A0A0A", fg: "#FFFFFF" },
    { key: "rounded-brand", shape: "rounded", bg: neutral, fg: onBrand },
    { key: "rounded-white", shape: "rounded", bg: "#FFFFFF", fg: onLightPaper },
    { key: "rounded-black", shape: "rounded", bg: "#0A0A0A", fg: "#FFFFFF" },
    { key: "square-brand", shape: "square", bg: neutral, fg: onBrand },
    { key: "square-white", shape: "square", bg: "#FFFFFF", fg: onLightPaper },
  ];
};

function visibleImageRect(img: HTMLImageElement) {
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, w, h };
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { x: 0, y: 0, w, h }; }
  const distance = (offset: number, rgb: [number, number, number]) => Math.max(
    Math.abs(data[offset] - rgb[0]),
    Math.abs(data[offset + 1] - rgb[1]),
    Math.abs(data[offset + 2] - rgb[2]),
  );
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (w * h - 1) * 4];
  const rgb: [number, number, number] = [data[0], data[1], data[2]];
  const hasPaper = data[3] > 235 && corners.every((offset) => data[offset + 3] > 235 && distance(offset, rgb) <= 36);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const offset = (y * w + x) * 4;
      if (data[offset + 3] <= 18) continue;
      if (hasPaper && distance(offset, rgb) <= 44) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w, h };
  const pad = Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.015);
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(w - 1, maxX + pad);
  const bottom = Math.min(h - 1, maxY + pad);
  return { x, y, w: Math.max(1, right - x + 1), h: Math.max(1, bottom - y + 1) };
}

function socialShapeRadius(shape: SocialIconShape, size: number) {
  if (shape === "circle") return size / 2;
  if (shape === "rounded") return Math.round(size * 0.22);
  return 0;
}

async function composeSocialIconCanvas(img: HTMLImageElement, variant: SocialIconVariant, size = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const radius = socialShapeRadius(variant.shape, size);

  ctx.beginPath();
  if (variant.shape === "circle") {
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  } else if (variant.shape === "rounded") {
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
  } else {
    ctx.rect(0, 0, size, size);
  }
  ctx.closePath();
  ctx.fillStyle = variant.bg;
  ctx.fill();

  const pad = Math.round(size * 0.18);
  const maxW = size - pad * 2;
  const maxH = size - pad * 2;
  const sourceRect = visibleImageRect(img);
  const scale = Math.min(maxW / sourceRect.w, maxH / sourceRect.h);
  const drawW = sourceRect.w * scale;
  const drawH = sourceRect.h * scale;
  ctx.drawImage(img, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
  return canvas;
}

async function imageLogoSourceForSocialIcon(url: string) {
  const transparent = await transparentLogo(url);
  try {
    return await createArtworkPreviewFromImageUrl(transparent.url, {
      outputWidth: 1024,
      outputHeight: 1024,
      paddingRatio: 0.03,
    });
  } catch {
    return transparent.url;
  }
}

async function renderSocialIconCanvas(asset: any, variant: SocialIconVariant, brandName: string) {
  let dataUrl: string;
  if (isBrandKitLogotypeAsset(asset)) {
    dataUrl = await brandLogotypeToPng(asset, variant.fg, brandName, 4);
  } else if (asset?.image_url || asset?.thumbnail_url) {
    dataUrl = await imageLogoSourceForSocialIcon(asset.image_url || asset.thumbnail_url);
  } else if (isCanvasAsset(asset)) {
    dataUrl = await createCanvasElementsPreview(asset.editor_state, {
      outputWidth: 1024,
      outputHeight: 1024,
      paddingRatio: 0.03,
      normalizeLogoLockup: (asset as any)?.meta?.kind === "logo_lockup" || isCanvasLogoLockupAsset(asset),
      logoColor: variant.bg === "#0A0A0A" ? variant.fg : undefined,
    });
  } else {
    dataUrl = await logotypeToPng({ ...stateFromAsset(asset, brandName), color: variant.fg }, 4);
  }
  const img = await loadImage(dataUrl);
  return composeSocialIconCanvas(img, variant);
}

const stateFromAsset = (asset: any, brandName: string): LogotypeState => {
  if (isBrandKitLogotypeAsset(asset)) return logotypeStateFromAsset(asset, brandName);
  return defaultLogotypeState(brandName || asset?.title || "Brand");
};

function derivedCanvasAsset(asset: any, editorState: any[], suffix: string, assetType: string) {
  return {
    ...asset,
    id: `${asset.id || safeFile(asset.title || assetType)}:${suffix}`,
    title: `${asset.title || asset.asset_type || "logo"} ${suffix === "icon-only" ? "Icon" : "Logotype"}`,
    asset_type: assetType,
    image_url: null,
    thumbnail_url: null,
    editor_state: editorState,
    meta: { ...(asset.meta || {}), derived_from: asset.id, derived_kind: suffix, preview_url: null },
  };
}

function expandLogoAssets(assets: any[]) {
  const expanded: any[] = [];
  for (const asset of assets) {
    expanded.push(asset);
    const iconElements = canvasLogoLockupIconElements(asset);
    if (iconElements) expanded.push(derivedCanvasAsset(asset, iconElements, "icon-only", "icon"));
    const textElements = canvasLogoLockupTextElements(asset);
    if (textElements) expanded.push(derivedCanvasAsset(asset, textElements, "logotype-only", "logotype"));
  }
  return expanded;
}

const addCanvasExports = async (folder: JSZip, base: string, canvas: HTMLCanvasElement) => {
  let count = 0;
  const png = await canvasToBlob(canvas);
  folder.file(`${base}.png`, png);
  count += 1;
  const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? "landscape" : "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageW / canvas.width, pageH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h);
  folder.file(`${base}.pdf`, pdf.output("blob") as Blob);
  count += 1;
  return count;
};

function buildPaletteCanvas(brandName: string, palette: string[], paletteName: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0a0a";
  ctx.font = "600 58px Inter, system-ui, sans-serif";
  ctx.fillText(`${brandName} Palette`, 80, 120);
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 24px Inter, system-ui, sans-serif";
  ctx.fillText(paletteName || "Brand palette", 80, 165);
  const colors = palette.length ? palette : ["#1676e3", "#0a0a0a", "#ffffff", "#f4f4f5"];
  const sw = 240;
  const sh = 360;
  const gap = 28;
  colors.slice(0, 5).forEach((color, i) => {
    const x = 80 + i * (sw + gap);
    const y = 260;
    ctx.fillStyle = cleanHex(color, "#1676e3");
    ctx.fillRect(x, y, sw, sh);
    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(x, y, sw, sh);
    ctx.fillStyle = "#111827";
    ctx.font = "600 22px Inter, system-ui, sans-serif";
    ctx.fillText(`Color ${i + 1}`, x, y + sh + 44);
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 18px Inter, system-ui, sans-serif";
    ctx.fillText(String(color).toUpperCase(), x, y + sh + 76);
  });
  return canvas;
}

function buildFontCanvas(brandName: string, font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0a0a0a";
  ctx.font = "600 58px Inter, system-ui, sans-serif";
  ctx.fillText(`${brandName} Fonts`, 80, 120);
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 24px Inter, system-ui, sans-serif";
  ctx.fillText("Primary typography specimen", 80, 165);
  const family = font || "Inter";
  ctx.fillStyle = "#0a0a0a";
  ctx.font = `700 96px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText(family, 80, 330);
  ctx.font = `400 42px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText("Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj", 80, 450);
  ctx.fillText("0123456789 — The quick brown fox", 80, 530);
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 26px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText("Use this face across wordmarks, headings, and brand-led layouts.", 80, 640);
  return canvas;
}

async function buildBrandBookCanvas(brandName: string, primary: any, palette: string[], font: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1700; // 8.5" @ 200dpi
  canvas.height = 2200; // 11" @ 200dpi
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const brandColor = cleanHex((palette && palette[0]) || "#1676e3");
  const M = 100;

  // Header
  ctx.fillStyle = "#0a0a0a";
  ctx.font = "500 22px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#6b7280";
  ctx.fillText("BRAND BOOK", M, M + 30);
  ctx.fillStyle = "#0a0a0a";
  ctx.font = "700 72px Inter, system-ui, sans-serif";
  ctx.fillText(brandName, M, M + 110);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "400 20px Inter, system-ui, sans-serif";
  const dateStr = new Date().toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();
  const rightLabel = `V1.0  ·  ${dateStr}`;
  ctx.textAlign = "right";
  ctx.fillText(rightLabel, canvas.width - M, M + 40);
  ctx.textAlign = "left";
  // Divider
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M, M + 160);
  ctx.lineTo(canvas.width - M, M + 160);
  ctx.stroke();

  // === LOGO SECTION ===
  let y = M + 210;
  ctx.fillStyle = "#6b7280";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillText("LOGO", M, y);
  y += 24;

  const tileW = (canvas.width - M * 2 - 24) / 2;
  const tileH = 320;

  const drawTile = async (asset: any, bg: string, x: number, ty: number) => {
    // background
    ctx.fillStyle = bg;
    ctx.fillRect(x, ty, tileW, tileH);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, ty + 0.5, tileW - 1, tileH - 1);
    if (!asset) return;
    try {
      let dataUrl: string | null = null;
      if (isBrandKitLogotypeAsset(asset)) {
        const state = stateFromAsset(asset, brandName);
        dataUrl = await brandLogotypeToPng(asset, pickLogoColor(bg) === "#FFFFFF" ? "#ffffff" : (state.color || "#0a0a0a"), brandName, 3);
        // Force contrast color regardless of saved color
        dataUrl = await brandLogotypeToPng(asset, pickLogoColor(bg), brandName, 3);
      } else if (isCanvasAsset(asset)) {
        dataUrl = await createCanvasElementsPreview(asset.editor_state, {
          outputWidth: 1200,
          outputHeight: 900,
          paddingRatio: 0.14,
          normalizeLogoLockup: (asset as any)?.meta?.kind === "logo_lockup" || isCanvasLogoLockupAsset(asset),
          logoColor: isDarkBg(bg) ? pickLogoColor(bg) : undefined,
        });
      } else if (asset?.image_url || asset?.thumbnail_url) {
        const url = asset.image_url || asset.thumbnail_url;
        try {
          const transparent = await transparentLogo(url);
          if (isDarkBg(bg) && transparent.hasTransparency) {
            const sil = await silhouetteImage(url, "#FFFFFF");
            dataUrl = sil.hasAlpha ? sil.url : transparent.url;
          } else {
            dataUrl = transparent.url;
          }
        } catch {
          dataUrl = url;
        }
      }
      if (!dataUrl) return;
      const img = await loadImage(dataUrl);
      const pad = 40;
      const maxW = tileW - pad * 2;
      const maxH = tileH - pad * 2;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (tileW - dw) / 2, ty + (tileH - dh) / 2, dw, dh);
    } catch {
      // ignore
    }
  };

  await drawTile(primary, "#ffffff", M, y);
  await drawTile(primary, brandColor, M + tileW + 24, y);
  y += tileH + 24;
  await drawTile(primary, "#ffffff", M, y);
  await drawTile(primary, "#0a0a0a", M + tileW + 24, y);
  y += tileH + 48;

  // === PALETTE ===
  ctx.fillStyle = "#6b7280";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillText("COLOR PALETTE", M, y);
  y += 24;

  const colors = (palette.length ? palette : ["#1676e3", "#0a0a0a", "#ffffff", "#f4f4f5"]).slice(0, 5);
  const labels = ["Primary", "Secondary", "Accent", "Highlight", "Ink"];
  const swGap = 20;
  const swW = (canvas.width - M * 2 - swGap * (colors.length - 1)) / colors.length;
  const swH = 200;
  colors.forEach((color, i) => {
    const x = M + i * (swW + swGap);
    ctx.fillStyle = cleanHex(color, "#1676e3");
    ctx.fillRect(x, y, swW, swH);
    ctx.strokeStyle = "#e5e7eb";
    ctx.strokeRect(x + 0.5, y + 0.5, swW - 1, swH - 1);
    ctx.fillStyle = "#0a0a0a";
    ctx.font = "600 20px Inter, system-ui, sans-serif";
    ctx.fillText(labels[i] || `Color ${i + 1}`, x, y + swH + 32);
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 18px Inter, system-ui, sans-serif";
    ctx.fillText(String(color).toUpperCase(), x, y + swH + 58);
  });
  y += swH + 100;

  // === TYPOGRAPHY ===
  ctx.fillStyle = "#6b7280";
  ctx.font = "600 18px Inter, system-ui, sans-serif";
  ctx.fillText("TYPOGRAPHY", M, y);
  y += 30;

  const family = font || "Inter";
  // Card
  ctx.strokeStyle = "#e5e7eb";
  ctx.strokeRect(M + 0.5, y + 0.5, canvas.width - M * 2 - 1, 220);
  ctx.fillStyle = "#0a0a0a";
  ctx.font = `700 72px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText(family, M + 30, y + 90);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 16px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PRIMARY", canvas.width - M - 30, y + 40);
  ctx.textAlign = "left";
  ctx.fillStyle = "#374151";
  ctx.font = `400 26px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText("Aa Bb Cc Dd Ee Ff Gg 0123456789", M + 30, y + 145);
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 22px "${family}", Inter, system-ui, sans-serif`;
  ctx.fillText("The quick brown fox jumps over the lazy dog.", M + 30, y + 190);
  y += 240;

  // === FOOTER ===
  const footerY = canvas.height - M;
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(M, footerY - 30);
  ctx.lineTo(canvas.width - M, footerY - 30);
  ctx.stroke();
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 16px Inter, system-ui, sans-serif";
  ctx.fillText(`${brandName.toUpperCase()} · BRAND BOOK`, M, footerY);
  ctx.textAlign = "right";
  ctx.fillText("MADE WITH ROCKET", canvas.width - M, footerY);
  ctx.textAlign = "left";
  return canvas;
}

async function loadProject(supabase: any, projectId: string, project?: any) {
  if (project?.id && project?.name) return project;
  const selects = ["id,name,brand_color,tagline", "id,name,tagline", "id,name,brand_color", "id,name"];
  for (const select of selects) {
    const result = await supabase.from("projects").select(select).eq("id", projectId).maybeSingle();
    if (!result.error) return result.data || project || { id: projectId, name: "brand-kit" };
  }
  return project || { id: projectId, name: "brand-kit" };
}

async function loadAssets(supabase: any, projectId: string) {
  const select = "id,title,asset_type,image_url,thumbnail_url,content,editor_state,meta,created_at";
  let result = await supabase
    .from("assets")
    .select(select)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (result.error && isMissingColumnError(result.error, "deleted_at")) {
    result = await supabase
      .from("assets")
      .select(select)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(300);
  }
  // Only include designs the user explicitly saved into the brand kit — this
  // mirrors the filter used by Brand.tsx / SocialIcons.tsx / BrandGuidelines.tsx
  // so downloads always match what's on screen. Generated but un-saved chat
  // outputs share the project_id but should not ship in the ZIP.
  const rows = (result.data || []).filter(Boolean);
  const saved = rows.filter((a: any) => Boolean(a?.meta?.saved_at));
  return saved.length ? saved : rows.filter((a: any) => a?.meta?.pinned || a?.pinned);
}

export async function downloadCompleteBrandKit({ supabase, projectId, project }: BrandKitDownloadArgs): Promise<BrandKitDownloadResult> {
  const [loadedProject, assets] = await Promise.all([
    loadProject(supabase, projectId, project),
    loadAssets(supabase, projectId),
  ]);
  const brandName = String(loadedProject?.name || "brand-kit");
  const filename = `${safeFile(brandName)}.zip`;
  const meta = loadBrandMeta(projectId);
  const brandColor = cleanHex(meta.brand_color || loadedProject?.brand_color, "#1676e3");
  const palette = meta.palette?.length ? meta.palette.map((c) => cleanHex(c, brandColor)) : [brandColor, "#0a0a0a", "#ffffff", "#f4f4f5"];
  const font = meta.font || "Inter";
  const zip = new JSZip();
  const skipped: string[] = [];
  let included = 0;
  const usedNames = new Map<string, number>();
  const uniq = (folder: string, name: string) => {
    const key = `${folder}/${name}`;
    const count = usedNames.get(key) || 0;
    usedNames.set(key, count + 1);
    return count === 0 ? name : `${name}-${count + 1}`;
  };
  const add = (folder: JSZip, folderName: string, name: string, data: string | Blob | ArrayBuffer) => {
    folder.file(uniq(folderName, name), data);
    included += 1;
  };

  const baseLogoAssets = assets.filter((a: any) => LOGO_TYPES.has(String(a?.asset_type || "").toLowerCase()) || isBrandKitLogotypeAsset(a) || isCanvasAsset(a) || a?.image_url || a?.thumbnail_url);
  const logoAssets = expandLogoAssets(baseLogoAssets);
  const primary = baseLogoAssets.find((a: any) => isCanvasLogoLockupAsset(a))
    || baseLogoAssets.find((a: any) => isBrandKitLogotypeAsset(a))
    || baseLogoAssets.find((a: any) => a?.image_url || a?.thumbnail_url)
    || baseLogoAssets[0]
    || logoAssets[0];
  const logoFolder = zip.folder("Logo-Icon Files")!;

  for (const asset of logoAssets) {
    const base = safeFile(asset.title || asset.asset_type || "logo-icon-file");
    if (isBrandKitLogotypeAsset(asset)) {
      const state = stateFromAsset(asset, brandName);
      try {
        const dataUrl = await brandLogotypeToPng(asset, state.color || "#0a0a0a", brandName, 4);
        const canvas = await urlToCanvas(dataUrl);
        const nativeSvg = asset?.editor_state?.kind === "logotype" ? logotypeToSvg(state) : undefined;
        await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", base, canvas, add, nativeSvg);
      } catch {
        skipped.push(asset.title || "Logotype");
      }
      continue;
    }
    if (isCanvasAsset(asset)) {
      try {
        const isSquare = (asset as any)?.meta?.derived_kind === "icon-only";
        const dataUrl = await createCanvasElementsPreview(asset.editor_state, {
          outputWidth: isSquare ? 1200 : 1600,
          outputHeight: isSquare ? 1200 : 900,
          paddingRatio: 0.14,
          normalizeLogoLockup: (asset as any)?.meta?.kind === "logo_lockup" || isCanvasLogoLockupAsset(asset),
        });
        const canvas = await urlToCanvas(dataUrl);
        await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", base, canvas, add);
      } catch {
        skipped.push((asset as any).title || "Logo/Icon file");
      }
      continue;
    }
    const url = asset.image_url || asset.thumbnail_url;
    if (!url) continue;
    try {
      const canvas = await urlToCanvas(url);
      await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", base, canvas, add);
    } catch {
      const got = await fetchBytes(url);
      if (got) add(logoFolder, "Logo-Icon Files", `${base}.${got.ext}`, got.bytes);
      else skipped.push(asset.title || "Logo/Icon file");
    }
  }

  if (isBrandKitLogotypeAsset(primary)) {
    const base = stateFromAsset(primary, brandName);
    const variants: Array<["regular" | "inverse" | "black", string]> = [["regular", base.color || "#0a0a0a"], ["inverse", "#ffffff"], ["black", "#000000"]];
    for (const [variant, color] of variants) {
      try {
        const dataUrl = await brandLogotypeToPng(primary, color, brandName, 4);
        const canvas = await urlToCanvas(dataUrl);
        const nativeSvg = primary?.editor_state?.kind === "logotype" ? logotypeToSvg({ ...base, color }) : undefined;
        await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", `primary-logo-${variant}`, canvas, add, nativeSvg);
      } catch {
        skipped.push(`primary logo ${variant}`);
      }
    }
  } else if (isCanvasAsset(primary)) {
    for (const variant of ["regular", "inverse", "black"] as const) {
      try {
        const dataUrl = await createCanvasElementsPreview(primary.editor_state, {
          outputWidth: 1600,
          outputHeight: 900,
          paddingRatio: 0.14,
          normalizeLogoLockup: (primary as any)?.meta?.kind === "logo_lockup" || isCanvasLogoLockupAsset(primary),
          logoColor: variant === "inverse" ? "#ffffff" : variant === "black" ? "#000000" : undefined,
        });
        const canvas = await urlToCanvas(dataUrl);
        await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", `primary-logo-${variant}`, canvas, add);
      } catch {
        skipped.push(`primary logo ${variant}`);
      }
    }
  } else if (primary?.image_url || primary?.thumbnail_url) {
    const url = primary.image_url || primary.thumbnail_url;
    for (const variant of ["regular", "inverse", "black"] as const) {
      try {
        const blob = await buildImageVariantBlob(url, variant);
        const canvas = await urlToCanvas(URL.createObjectURL(blob));
        await addAllFormatsFromCanvas(logoFolder, "Logo-Icon Files", `primary-logo-${variant}`, canvas, add);
      } catch {
        skipped.push(`primary logo ${variant}`);
      }
    }
  } else {
    add(logoFolder, "Logo-Icon Files", "README.txt", "No logo/icon files are saved in this brand kit yet.\n");
  }

  const socialFolder = zip.folder("Social Icons") || zip;
  if (logoAssets.length) {
    const socialVariants = buildSocialIconVariants(brandColor);
    for (const asset of logoAssets) {
      const assetBase = safeFile(asset.title || asset.asset_type || "logo");
      const assetFolder = socialFolder.folder(assetBase) || socialFolder;
      const folderPath = `Social Icons/${assetBase}`;
      for (const variant of socialVariants) {
        try {
          const canvas = await renderSocialIconCanvas(asset, variant, brandName);
          add(assetFolder, folderPath, `${assetBase}-social-${variant.key}.png`, await canvasToBlob(canvas));
        } catch {
          skipped.push(`${asset.title || "Logo"} social ${variant.key}`);
        }
      }
    }
  } else {
    add(socialFolder, "Social Icons", "README.txt", "No logo/icon files are saved in this brand kit yet, so no social icons could be generated.\n");
  }

  const filesFolder = zip.folder("Files")!;
  for (const asset of assets.filter((a: any) => !logoAssets.some((logo: any) => logo.id === a.id))) {
    const base = safeFile(asset.title || asset.asset_type || "asset");
    const url = asset.image_url || asset.thumbnail_url;
    if (url) {
      const got = await fetchBytes(url);
      if (got) add(filesFolder, "Files", `${base}.${got.ext}`, got.bytes);
      else skipped.push(asset.title || "File");
    } else if (asset.content) {
      add(filesFolder, "Files", `${base}.txt`, `${asset.title || "File"}\n\n${asset.content}\n`);
    }
  }

  const paletteFolder = zip.folder("Palette")!;
  add(paletteFolder, "Palette", "palette.txt", [
    `${brandName} · Palette`,
    meta.palette_key ? `Name: ${meta.palette_key}` : "Name: Brand palette",
    "",
    ...palette.map((color, index) => `${index + 1}. ${color.toUpperCase()}`),
    "",
  ].join("\n"));
  try { included += await addCanvasExports(paletteFolder, "palette", buildPaletteCanvas(brandName, palette, meta.palette_key || "Brand palette")); } catch { skipped.push("palette PNG/PDF"); }

  const fontsFolder = zip.folder("Fonts")!;
  add(fontsFolder, "Fonts", "fonts.txt", `${brandName} · Fonts\n\nPrimary: ${font}\nSource: Google Fonts (https://fonts.google.com/specimen/${encodeURIComponent(font.replace(/\s+/g, "+"))})\n`);
  try { included += await addCanvasExports(fontsFolder, "font-specimen", buildFontCanvas(brandName, font)); } catch { skipped.push("font specimen PNG/PDF"); }

  const brandBookFolder = zip.folder("Brand Book")!;
  add(brandBookFolder, "Brand Book", "brand-book.md", [
    `# ${brandName} — Brand Book`,
    "",
    `Generated by Rocket on ${new Date().toLocaleDateString()}.`,
    "",
    "## Logo/Icon Files",
    logoAssets.length ? `${logoAssets.length} logo/icon source file(s) included.` : "No logo/icon files saved yet.",
    "",
    "## Palette",
    ...palette.map((color) => `- ${color.toUpperCase()}`),
    "",
    "## Fonts",
    `- ${font}`,
    "",
    "## Social Icons",
    logoAssets.length ? `${logoAssets.length} source file(s) exported as circle, rounded, and square social profile icons.` : "No social icons generated yet.",
    "",
    "## Usage",
    "- Maintain clear space around the logo/icon file.",
    "- Use inverse variants on dark or photographic backgrounds.",
    "- Keep palette, typography, and logo/icon usage consistent across exports.",
    "",
  ].join("\n"));
  try { included += await addCanvasExports(brandBookFolder, "brand-book", await buildBrandBookCanvas(brandName, primary, palette, font)); } catch { skipped.push("brand book PNG/PDF"); }

  zip.file("README.txt", [
    `${brandName} — Rocket Brand Kit`,
    `Generated ${new Date().toISOString()}`,
    "",
    "Contents:",
    "  /Logo-Icon Files  logo/icon files as PNG, JPG, PSD, and SVG (Figma/Sketch/Canva) + regular/inverse/black variants",
    "  /Social Icons     profile icon PNGs in circle, rounded, and square shapes with light/dark/brand backgrounds",
    "  /Palette          palette.txt, palette.png, palette.pdf",
    "  /Fonts            fonts.txt, font-specimen.png, font-specimen.pdf",
    "  /Brand Book       brand-book.md, brand-book.png, brand-book.pdf",
    "  /Files            additional project files when available",
    skipped.length ? "" : "",
    skipped.length ? `Skipped: ${skipped.join(", ")}` : "All available brand kit sections were packed.",
    "",
  ].filter(Boolean).join("\n"));
  included += 1;

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, filename);
  return { included, skipped, filename };
}