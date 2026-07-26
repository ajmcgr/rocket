import { loadGoogleFont, type LogotypeState } from "@/lib/logotype";
import type { CanvasElement } from "@/lib/canvasAsset";
import { silhouetteImage, transparentLogo } from "@/lib/logoContrast";

type PreviewOptions = {
  outputWidth?: number;
  outputHeight?: number;
  paddingRatio?: number;
  background?: string | null;
  normalizeLogoLockup?: boolean;
  logoColor?: string;
};

const STAGE_W = 800;
const STAGE_H = 600;
const DEFAULT_OUTPUT = 1200;
const DEFAULT_PADDING_RATIO = 0.14;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const attempt = (crossOrigin: "anonymous" | null, url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      if (crossOrigin) image.crossOrigin = crossOrigin;
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load preview image"));
      image.src = url;
    });
  try { return await attempt("anonymous", src); } catch {}
  try {
    const res = await fetch(src, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try { return await attempt(null, objectUrl); } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  } catch {}
  return attempt(null, src);
}

function colorDistance(data: Uint8ClampedArray, offset: number, rgb: [number, number, number]) {
  return Math.max(
    Math.abs(data[offset] - rgb[0]),
    Math.abs(data[offset + 1] - rgb[1]),
    Math.abs(data[offset + 2] - rgb[2]),
  );
}

function detectSolidBackground(data: Uint8ClampedArray, width: number, height: number) {
  if (!width || !height) return null;
  const offsets = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
  const first = offsets[0];
  if (data[first + 3] < 245) return null;
  const rgb: [number, number, number] = [data[first], data[first + 1], data[first + 2]];
  const solid = offsets.every((offset) => data[offset + 3] >= 245 && colorDistance(data, offset, rgb) <= 18);
  return solid ? rgb : null;
}

function drawContained(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  sourceRect: { x: number; y: number; w: number; h: number },
  outW: number,
  outH: number,
  paddingRatio: number,
) {
  const padX = outW * paddingRatio;
  const padY = outH * paddingRatio;
  const availW = Math.max(1, outW - padX * 2);
  const availH = Math.max(1, outH - padY * 2);
  const scale = Math.min(availW / sourceRect.w, availH / sourceRect.h);
  const drawW = sourceRect.w * scale;
  const drawH = sourceRect.h * scale;
  const dx = (outW - drawW) / 2;
  const dy = (outH - drawH) / 2;
  ctx.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.w, sourceRect.h, dx, dy, drawW, drawH);
}

export async function createArtworkPreviewFromImageUrl(src: string, opts: PreviewOptions = {}): Promise<string> {
  let sourceUrl = src;
  try {
    sourceUrl = opts.logoColor ? (await silhouetteImage(src, opts.logoColor)).url : (await transparentLogo(src)).url;
  } catch {}
  const image = await loadImage(sourceUrl);
  const source = document.createElement("canvas");
  source.width = Math.max(1, image.naturalWidth || image.width || DEFAULT_OUTPUT);
  source.height = Math.max(1, image.naturalHeight || image.height || DEFAULT_OUTPUT);
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return src;
  sourceCtx.clearRect(0, 0, source.width, source.height);
  sourceCtx.drawImage(image, 0, 0, source.width, source.height);
  return createArtworkPreviewFromCanvas(source, opts);
}

export function createArtworkPreviewFromCanvas(source: HTMLCanvasElement, opts: PreviewOptions = {}): string {
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return source.toDataURL("image/png");

  const imageData = sourceCtx.getImageData(0, 0, source.width, source.height);
  const data = imageData.data;
  const background = detectSolidBackground(data, source.width, source.height);
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha <= 18) continue;
      if (background && alpha >= 235 && colorDistance(data, offset, background) <= 36) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const outW = opts.outputWidth || DEFAULT_OUTPUT;
  const outH = opts.outputHeight || DEFAULT_OUTPUT;
  const paddingRatio = opts.paddingRatio ?? DEFAULT_PADDING_RATIO;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext("2d");
  if (!outCtx) return source.toDataURL("image/png");
  outCtx.clearRect(0, 0, outW, outH);
  if (opts.background) {
    outCtx.fillStyle = opts.background;
    outCtx.fillRect(0, 0, outW, outH);
  }

  if (maxX < minX || maxY < minY) {
    drawContained(outCtx, source, { x: 0, y: 0, w: source.width, h: source.height }, outW, outH, paddingRatio);
    return out.toDataURL("image/png");
  }

  const cropPad = Math.ceil(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.015);
  const x = Math.max(0, minX - cropPad);
  const y = Math.max(0, minY - cropPad);
  const right = Math.min(source.width - 1, maxX + cropPad);
  const bottom = Math.min(source.height - 1, maxY + cropPad);
  drawContained(outCtx, source, { x, y, w: Math.max(1, right - x + 1), h: Math.max(1, bottom - y + 1) }, outW, outH, paddingRatio);
  return out.toDataURL("image/png");
}

function textForState(state: LogotypeState) {
  if (state.transform === "uppercase") return state.text.toUpperCase();
  if (state.transform === "lowercase") return state.text.toLowerCase();
  if (state.transform === "capitalize") return state.text.replace(/\b\w/g, (c) => c.toUpperCase());
  return state.text;
}

function drawText(ctx: CanvasRenderingContext2D, el: Extract<CanvasElement, { kind: "text" }>, colorOverride?: string) {
  const fontSize = Math.max(1, Number(el.fontSize) || 48);
  const weight = Number(el.fontWeight) || 400;
  const family = String(el.fontFamily || "Inter").trim() || "Inter";
  const text = String(el.text || "");
  const fontStyle = weight >= 600 ? "bold" : "normal";
  ctx.font = `${fontStyle} ${fontSize}px '${family}', ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = colorOverride || el.color || "#0A0A0A";
  // Match Konva.Text's modern renderer: y is the top of the line box, then
  // text is drawn on an alphabetic baseline derived from the font box.
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(text);
  const mMetrics = ctx.measureText("M");
  const fontBoxAscent = mMetrics.fontBoundingBoxAscent || mMetrics.actualBoundingBoxAscent || fontSize * 0.91;
  const fontBoxDescent = mMetrics.fontBoundingBoxDescent || mMetrics.actualBoundingBoxDescent || fontSize * 0.21;
  const baselineY = ((fontBoxAscent - fontBoxDescent) / 2) + (fontSize / 2);
  const align = el.align || "left";
  const x = align === "center"
    ? el.x + el.w / 2 - metrics.width / 2
    : align === "right"
      ? el.x + el.w - metrics.width
      : el.x;
  ctx.fillText(text, x, el.y + baselineY);
}

function drawRegularPolygon(ctx: CanvasRenderingContext2D, sides: number, cx: number, cy: number, radius: number, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = rotation + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function measureCanvasText(el: Extract<CanvasElement, { kind: "text" }>) {
  const fontSize = Math.max(1, Number(el.fontSize) || 48);
  const weight = Number(el.fontWeight) || 400;
  const family = String(el.fontFamily || "Inter").trim() || "Inter";
  const text = String(el.text || "");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { x: el.x, y: el.y, w: Math.max(1, el.w), h: Math.max(1, el.h) };
  const fontStyle = weight >= 600 ? "bold" : "normal";
  ctx.font = `${fontStyle} ${fontSize}px '${family}', ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const mMetrics = ctx.measureText("M");
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.76;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.22;
  const fontBoxAscent = mMetrics.fontBoundingBoxAscent || mMetrics.actualBoundingBoxAscent || fontSize * 0.91;
  const fontBoxDescent = mMetrics.fontBoundingBoxDescent || mMetrics.actualBoundingBoxDescent || fontSize * 0.21;
  const baselineY = ((fontBoxAscent - fontBoxDescent) / 2) + (fontSize / 2);
  const width = Math.max(1, metrics.width || text.length * fontSize * 0.58);
  const height = Math.max(fontSize * 0.82, ascent + descent);
  const align = el.align || "left";
  const x = align === "center"
    ? el.x + el.w / 2 - width / 2
    : align === "right"
      ? el.x + el.w - width
      : el.x;
  return { x, y: el.y + baselineY - ascent, w: width, h: height };
}

async function imageVisibleBoxForElement(el: Extract<CanvasElement, { kind: "image" }>) {
  try {
    const image = await loadImage(el.src);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) throw new Error("missing image size");
    const scale = Math.min(1, 512 / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("missing image context");
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const cornerOffsets = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
    const bg: [number, number, number] = [data[0], data[1], data[2]];
    const hasSolidBackground = data[3] > 240 && cornerOffsets.every((offset) => data[offset + 3] > 240 && colorDistance(data, offset, bg) < 22);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] < 20) continue;
        if (hasSolidBackground && colorDistance(data, offset, bg) < 42) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) throw new Error("missing visible image pixels");
    return {
      x: el.x + (minX / width) * el.w,
      y: el.y + (minY / height) * el.h,
      w: ((maxX - minX + 1) / width) * el.w,
      h: ((maxY - minY + 1) / height) * el.h,
    };
  } catch {
    return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

async function normalizeLogoLockupElements(elements: CanvasElement[]) {
  const image = elements.find((el): el is Extract<CanvasElement, { kind: "image" }> => el.kind === "image" && el.visible !== false);
  const text = elements
    .filter((el): el is Extract<CanvasElement, { kind: "text" }> => el.kind === "text" && el.visible !== false && String(el.text || "").trim().length > 0)
    .sort((a, b) => String(b.text || "").length - String(a.text || "").length)[0];
  if (!image || !text) return elements;

  const [imageBox, textBox] = await Promise.all([imageVisibleBoxForElement(image), Promise.resolve(measureCanvasText(text))]);
  const targetTextHeight = Math.max(24, textBox.h);
  const imageScale = imageBox.h > 0 ? Math.min(1.35, Math.max(0.25, (targetTextHeight * 1.08) / imageBox.h)) : 1;
  const scaledImageW = image.w * imageScale;
  const scaledImageH = image.h * imageScale;
  const localImageBox = {
    x: (imageBox.x - image.x) * imageScale,
    y: (imageBox.y - image.y) * imageScale,
    w: imageBox.w * imageScale,
    h: imageBox.h * imageScale,
  };
  const fontSize = Math.max(1, Number(text.fontSize) || 48);
  const gap = Math.max(18, Math.min(34, fontSize * 0.32));
  const totalW = localImageBox.w + gap + textBox.w;
  const centerY = STAGE_H / 2;
  const imageVisualX = (STAGE_W - totalW) / 2;
  const imageVisualY = centerY - localImageBox.h / 2;
  const nextImageX = imageVisualX - localImageBox.x;
  const nextImageY = imageVisualY - localImageBox.y;
  const nextTextX = imageVisualX + localImageBox.w + gap;
  const textVisualOffsetY = textBox.y - text.y;
  const nextTextY = centerY - textBox.h / 2 - textVisualOffsetY;
  const textWidth = Math.max(text.w, Math.ceil(textBox.w + fontSize * 0.24));

  return elements.map((el) => {
    if (el.id === image.id) return { ...el, x: nextImageX, y: nextImageY, w: scaledImageW, h: scaledImageH } as CanvasElement;
    if (el.id === text.id) return { ...el, x: nextTextX, y: nextTextY, w: textWidth, h: Math.max(text.h, fontSize * 1.35), align: "left" as const } as CanvasElement;
    return el;
  });
}

export async function createLogotypePreview(state: LogotypeState, opts: PreviewOptions = {}): Promise<string> {
  loadGoogleFont(state.font, [state.weight]);
  try { await document.fonts?.load?.(`${state.weight} 180px '${state.font}'`); } catch {}
  const source = document.createElement("canvas");
  source.width = 2000;
  source.height = 600;
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source.toDataURL("image/png");
  const text = textForState(state);
  const fontSize = 180;
  ctx.font = `${state.weight} ${fontSize}px '${state.font}', ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = state.color || "#0A0A0A";
  ctx.textBaseline = "alphabetic";
  let x = 160;
  const y = 340;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + (state.letterSpacing || 0) * fontSize;
  }
  return createArtworkPreviewFromCanvas(source, opts);
}

export async function createCanvasElementsPreview(elements: CanvasElement[], opts: PreviewOptions = {}): Promise<string> {
  const textElements = elements.filter((el): el is Extract<CanvasElement, { kind: "text" }> => el.kind === "text" && el.visible !== false);
  await Promise.all(textElements.map(async (el) => {
    const family = String(el.fontFamily || "Inter").trim() || "Inter";
    const weight = Number(el.fontWeight) || 400;
    loadGoogleFont(family, [weight]);
    try { await document.fonts?.load?.(`${weight} ${Number(el.fontSize) || 48}px '${family}'`); } catch {}
  }));

  const renderElements = opts.normalizeLogoLockup ? await normalizeLogoLockupElements(elements) : elements;

  const source = document.createElement("canvas");
  source.width = STAGE_W;
  source.height = STAGE_H;
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source.toDataURL("image/png");
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);

  for (const el of renderElements) {
    if (el.visible === false) continue;
    ctx.save();
    const rotation = ((el.rotation || 0) * Math.PI) / 180;
    if (rotation) {
      ctx.translate(el.x, el.y);
      ctx.rotate(rotation);
      ctx.translate(-el.x, -el.y);
    }
    switch (el.kind) {
      case "text":
        drawText(ctx, el, opts.logoColor);
        break;
      case "rect":
      case "sticky": {
        ctx.fillStyle = el.fill;
        const radius = el.kind === "rect" ? el.radius || 0 : 12;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.w, el.h, radius);
        ctx.fill();
        if (el.kind === "sticky") drawText(ctx, { ...el, kind: "text", x: el.x + 12, y: el.y + 12, w: el.w - 24, h: el.h - 24, fontSize: 18, fontWeight: 400, fontFamily: "Inter", align: "left" }, opts.logoColor);
        break;
      }
      case "circle":
        ctx.fillStyle = el.fill;
        ctx.beginPath();
        ctx.arc(el.x + el.w / 2, el.y + el.h / 2, Math.min(el.w, el.h) / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "line":
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.thickness;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.stroke();
        break;
      case "triangle":
        ctx.fillStyle = el.fill;
        drawRegularPolygon(ctx, 3, el.x + el.w / 2, el.y + el.h / 2, Math.min(el.w, el.h) / 2, -Math.PI / 2);
        ctx.fill();
        break;
      case "star":
        ctx.fillStyle = el.fill;
        drawStar(ctx, el.x + el.w / 2, el.y + el.h / 2, Math.min(el.w, el.h) / 2, Math.min(el.w, el.h) * 0.2);
        ctx.fill();
        break;
      case "table": {
        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, el.w, el.h);
        ctx.strokeStyle = el.lineColor;
        ctx.lineWidth = 1;
        const rowH = el.h / Math.max(1, el.rows);
        const colW = el.w / Math.max(1, el.cols);
        for (let row = 0; row <= el.rows; row += 1) {
          ctx.beginPath();
          ctx.moveTo(el.x, el.y + row * rowH);
          ctx.lineTo(el.x + el.w, el.y + row * rowH);
          ctx.stroke();
        }
        for (let col = 0; col <= el.cols; col += 1) {
          ctx.beginPath();
          ctx.moveTo(el.x + col * colW, el.y);
          ctx.lineTo(el.x + col * colW, el.y + el.h);
          ctx.stroke();
        }
        break;
      }
      case "image": {
        try {
          let imageSrc = el.src;
          try {
            imageSrc = opts.logoColor ? (await silhouetteImage(el.src, opts.logoColor)).url : (await transparentLogo(el.src)).url;
          } catch {}
          const image = await loadImage(imageSrc);
          ctx.drawImage(image, el.x, el.y, el.w, el.h);
        } catch {}
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  return createArtworkPreviewFromCanvas(source, opts);
}