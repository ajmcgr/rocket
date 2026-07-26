// Shared helpers for choosing the most legible logo variant for a given
// background, and for rasterizing image logos (with alpha) into black or
// white silhouettes so the correct variant is rendered automatically.

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = String(hex || "").trim().replace(/^#/, "");
  const s = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const m = /^([a-f0-9]{6})([a-f0-9]{2})?$/i.exec(s);
  if (!m) return { r: 10, g: 10, b: 10 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance per WCAG (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function isDarkBg(hex: string): boolean {
  return luminance(hex) < 0.5;
}

/**
 * Pick the most legible logo fill for a background — always the ink or paper
 * that gives the strongest contrast. Never returns a low-contrast option.
 */
export function pickLogoColor(bg: string, opts?: { ink?: string; paper?: string }): string {
  const ink = opts?.ink || "#0A0A0A";
  const paper = opts?.paper || "#FFFFFF";
  return isDarkBg(bg) ? paper : ink;
}

/** Which named variant should render on the given background. */
export type LogoVariantKey = "black" | "white";
export function pickLogoVariant(bg: string): LogoVariantKey {
  return isDarkBg(bg) ? "white" : "black";
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const attempt = (crossOrigin: "anonymous" | null, url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = crossOrigin;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load logo image"));
      img.src = url;
    });
  // First try a CORS-enabled load so canvas ops (getImageData) work.
  try { return await attempt("anonymous", src); } catch {}
  // Fallback: fetch the bytes and load via object URL so images from origins
  // without CORS headers still render and keep canvas untainted.
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
  // Last resort: load without CORS so at least the display path works
  // (canvas ops may throw on tainted data, and callers already handle that).
  return attempt(null, src);
}

/**
 * Remove a solid/near-solid background from a raster logo via corner-seeded
 * flood fill. Only runs when all four corners agree on roughly the same color
 * (a strong signal the image was exported on a flat background). Uses a tight
 * tolerance so real logo pixels are preserved. Falls back to the original
 * image if the corners disagree or the sampled color is close to black.
 */
function keyOutBackground(img: HTMLImageElement): { url: string; changed: boolean } {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return { url: img.src, changed: false };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: img.src, changed: false };
  ctx.drawImage(img, 0, 0);
  let imageData: ImageData;
  try { imageData = ctx.getImageData(0, 0, w, h); } catch { return { url: img.src, changed: false }; }
  const data = imageData.data;

  const idx = (x: number, y: number) => (y * w + x) * 4;
  const corners: [number, number][] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  const samples = corners.map(([x, y]) => {
    const i = idx(x, y);
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  });
  // Require all corners opaque and mutually similar.
  const c0 = samples[0];
  if (c0.a < 240) return { url: img.src, changed: false };
  for (let k = 1; k < samples.length; k++) {
    const c = samples[k];
    if (c.a < 240) return { url: img.src, changed: false };
    if (Math.abs(c.r - c0.r) > 12 || Math.abs(c.g - c0.g) > 12 || Math.abs(c.b - c0.b) > 12) {
      return { url: img.src, changed: false };
    }
  }
  // Don't key out near-black backgrounds — those are legitimate dark tiles.
  const brightness = (c0.r + c0.g + c0.b) / 3;
  if (brightness < 40) return { url: img.src, changed: false };

  const tol = 28;
  const targetR = c0.r, targetG = c0.g, targetB = c0.b;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const [x, y] of corners) stack.push(x, y);
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    const i = p * 4;
    if (data[i + 3] < 8) { visited[p] = 1; continue; }
    if (
      Math.abs(data[i] - targetR) > tol ||
      Math.abs(data[i + 1] - targetG) > tol ||
      Math.abs(data[i + 2] - targetB) > tol
    ) continue;
    visited[p] = 1;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  ctx.putImageData(imageData, 0, 0);
  return { url: canvas.toDataURL("image/png"), changed: true };
}

function detectAlpha(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] < 250) transparent++;
      if (transparent > 20) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Return the source image untouched. Background-keying was too aggressive and
 * ate real logo pixels, so we now trust the source PNG's alpha channel and let
 * the caller pick a light/dark tile that reads well.
 */
export async function transparentLogo(src: string): Promise<{ url: string; hasTransparency: boolean; image: HTMLImageElement }> {
  const img = await loadImage(src);
  if (detectAlpha(img)) return { url: src, hasTransparency: true, image: img };
  const keyed = keyOutBackground(img);
  if (keyed.changed) {
    try {
      const nextImg = await loadImage(keyed.url);
      return { url: keyed.url, hasTransparency: true, image: nextImg };
    } catch {}
  }
  return { url: src, hasTransparency: false, image: img };
}

/**
 * Rasterize an image logo as a silhouette in `color`. If the source has no
 * meaningful alpha channel, returns the original URL — the caller should then
 * render onto a contrasting background rather than attempt an invalid recolor.
 */
export async function silhouetteImage(src: string, color: string): Promise<{ url: string; hasAlpha: boolean; image: HTMLImageElement }> {
  const img = await loadImage(src);
  let workingImg = img;
  let hasAlpha = detectAlpha(img);
  if (!hasAlpha) {
    const keyed = keyOutBackground(img);
    if (keyed.changed) {
      try { workingImg = await loadImage(keyed.url); hasAlpha = true; } catch {}
    }
  }
  if (!hasAlpha) return { url: src, hasAlpha: false, image: img };
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = workingImg.naturalWidth || workingImg.width;
  sourceCanvas.height = workingImg.naturalHeight || workingImg.height;
  sourceCanvas.getContext("2d")!.drawImage(workingImg, 0, 0);
  const out = document.createElement("canvas");
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return { url: out.toDataURL("image/png"), hasAlpha: true, image: workingImg };
}