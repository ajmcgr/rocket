import { logotypeToPng } from "@/components/Logotype";
import { isCanvasAsset, type CanvasElement } from "@/lib/canvasAsset";
import { defaultLogotypeState, loadGoogleFont, normalizeLogotypeText, type LogotypeState } from "@/lib/logotype";

type CanvasText = Extract<CanvasElement, { kind: "text" }>;

export function isStoredLogotypeAsset(asset: any): boolean {
  return asset?.editor_state?.kind === "logotype";
}

export function isCanvasLogotypeAsset(asset: any): boolean {
  if (!isCanvasAsset(asset)) return false;
  const elements = (asset.editor_state || []) as CanvasElement[];
  const visible = elements.filter((el) => el.visible !== false);
  const text = visible.filter((el) => el.kind === "text");
  if (!text.length) return false;

  // Only treat clean text-only logo files as logotypes. Icons and illustrated
  // assets keep using the existing image/icon pipeline.
  const hasNonTextArtwork = visible.some((el) => el.kind !== "text");
  if (hasNonTextArtwork) return false;
  return true;
}

export function isCanvasLogoLockupAsset(asset: any): boolean {
  if (!isCanvasAsset(asset)) return false;
  const elements = (asset.editor_state || []) as CanvasElement[];
  const visible = elements.filter((el) => el.visible !== false);
  const hasText = visible.some((el) => el.kind === "text" && Boolean(String(el.text || "").trim()));
  const hasArtwork = visible.some((el) => el.kind !== "text");
  return hasText && hasArtwork;
}

export function canvasLogoLockupIconElements(asset: any): CanvasElement[] | null {
  if (!isCanvasLogoLockupAsset(asset)) return null;
  const elements = ((asset.editor_state || []) as CanvasElement[]).filter((el) => el.visible !== false && el.kind !== "text");
  return elements.length ? elements : null;
}

export function canvasLogoLockupTextElements(asset: any): CanvasElement[] | null {
  if (!isCanvasLogoLockupAsset(asset)) return null;
  const elements = ((asset.editor_state || []) as CanvasElement[]).filter(
    (el) => el.visible !== false && el.kind === "text" && Boolean(String(el.text || "").trim()),
  );
  return elements.length ? elements : null;
}

export function isBrandKitLogotypeAsset(asset: any): boolean {
  return isStoredLogotypeAsset(asset) || isCanvasLogotypeAsset(asset);
}

export function logotypeLabel(asset: any, fallback = "Brand") {
  if (isCanvasLogotypeAsset(asset)) {
    const text = ((asset.editor_state || []) as CanvasElement[])
      .filter((el): el is CanvasText => el.kind === "text" && el.visible !== false)
      .map((el) => String(el.text || "").trim())
      .filter(Boolean)
      .join(" ");
    return text || fallback;
  }
  return String(
    asset?.editor_state?.kind === "logotype"
      ? asset.editor_state.text
      : asset?.title || fallback,
  ).trim() || fallback;
}

export function logotypeStateFromAsset(asset: any, fallback = "Brand"): LogotypeState {
  if (asset?.editor_state?.kind === "logotype") return asset.editor_state as LogotypeState;
  if (isCanvasLogotypeAsset(asset)) {
    const elements = (asset.editor_state || []) as CanvasElement[];
    const firstText = elements.find((el): el is CanvasText => el.kind === "text" && el.visible !== false && Boolean(String(el.text || "").trim()));
    return {
      kind: "logotype",
      text: normalizeLogotypeText(logotypeLabel(asset, fallback)) || logotypeLabel(asset, fallback),
      font: firstText?.fontFamily || "Space Grotesk",
      weight: Number(firstText?.fontWeight) || 700,
      color: firstText?.color || "#0a0a0a",
      letterSpacing: 0,
      transform: "none",
    };
  }
  return defaultLogotypeState(logotypeLabel(asset, fallback));
}

function textBounds(ctx: CanvasRenderingContext2D, el: CanvasText) {
  const fontSize = Number(el.fontSize) || 96;
  const weight = Number(el.fontWeight) || 700;
  const family = String(el.fontFamily || "Space Grotesk");
  const text = String(el.text || "");
  ctx.font = `${weight} ${fontSize}px '${family}', ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const width = Math.max(1, metrics.width);
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.82;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.24;
  const height = Math.max(1, ascent + descent);
  const boxW = Number(el.w) || width;
  const boxH = Number(el.h) || height;
  const align = el.align || "left";
  const x = align === "center"
    ? (Number(el.x) || 0) + (boxW - width) / 2
    : align === "right"
      ? (Number(el.x) || 0) + boxW - width
      : (Number(el.x) || 0);
  const y = (Number(el.y) || 0) + (boxH - height) / 2;
  return { x, y, width, height, ascent, fontSize, weight, family, text };
}

export async function canvasLogotypeToPng(elements: CanvasElement[], color: string, scale = 4): Promise<string> {
  const textElements = elements.filter((el): el is CanvasText => el.kind === "text" && el.visible !== false && Boolean(String(el.text || "").trim()));
  if (!textElements.length) throw new Error("No logotype text to render");

  await Promise.all(textElements.map(async (el) => {
    const family = String(el.fontFamily || "Space Grotesk");
    const weight = Number(el.fontWeight) || 700;
    loadGoogleFont(family, [weight]);
    try { await (document as any).fonts?.load?.(`${weight} ${Number(el.fontSize) || 96}px '${family}'`); } catch {}
  }));

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d")!;
  const measured = textElements.map((el) => textBounds(measureCtx, el));
  const minX = Math.min(...measured.map((m) => m.x));
  const minY = Math.min(...measured.map((m) => m.y));
  const maxX = Math.max(...measured.map((m) => m.x + m.width));
  const maxY = Math.max(...measured.map((m) => m.y + m.height));
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const pad = Math.max(48, Math.round(Math.max(contentW, contentH) * 0.16));
  const outW = Math.ceil(contentW + pad * 2);
  const outH = Math.ceil(contentH + pad * 2);

  const canvas = document.createElement("canvas");
  canvas.width = outW * scale;
  canvas.height = outH * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, outW, outH);
  ctx.textBaseline = "alphabetic";
  for (const m of measured) {
    ctx.font = `${m.weight} ${m.fontSize}px '${m.family}', ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(m.text, pad + (m.x - minX), pad + (m.y - minY) + m.ascent);
  }
  return canvas.toDataURL("image/png");
}

export async function brandLogotypeToPng(asset: any, color: string, fallback = "Brand", scale = 4): Promise<string> {
  if (asset?.editor_state?.kind === "logotype") {
    return logotypeToPng({ ...(asset.editor_state as LogotypeState), color }, scale);
  }
  if (isCanvasLogotypeAsset(asset)) {
    return canvasLogotypeToPng(asset.editor_state as CanvasElement[], color, scale);
  }
  return logotypeToPng({ ...defaultLogotypeState(logotypeLabel(asset, fallback)), color }, scale);
}