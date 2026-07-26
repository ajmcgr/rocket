import { useEffect, useMemo, useState } from "react";
import { loadGoogleFont, type LogotypeState } from "@/lib/logotype";

interface Props {
  state: LogotypeState;
  className?: string;
  /** Render inside a fixed container with this aspect ratio (defaults to natural). */
  fit?: "contain" | "natural";
  /** Font size in px when fit="natural". */
  fontSizePx?: number;
}

/** Lightweight DOM-based logotype renderer used in cards. */
export function Logotype({ state, className, fit = "natural", fontSizePx = 64 }: Props) {
  // Harden against partial/legacy editor_state where fields may be missing.
  const safe = {
    text: String((state as any)?.text ?? "").trim() || "Brand",
    font: String((state as any)?.font || "Space Grotesk"),
    weight: Number((state as any)?.weight) || 600,
    color: String((state as any)?.color || "#0A0A0A"),
    letterSpacing: Number.isFinite(Number((state as any)?.letterSpacing))
      ? Number((state as any).letterSpacing)
      : 0,
    transform: ((state as any)?.transform || "none") as LogotypeState["transform"],
  };
  const [tick, setTick] = useState(0);
  useEffect(() => {
    loadGoogleFont(safe.font, [safe.weight]);
    let cancelled = false;
    (async () => {
      try { await (document as any).fonts?.load?.(`${safe.weight} 100px '${safe.font}'`); } catch {}
      if (!cancelled) setTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [safe.font, safe.weight]);

  const displayText = useMemo(() => {
    const raw = safe.text;
    if (safe.transform === "uppercase") return raw.toUpperCase();
    if (safe.transform === "lowercase") return raw.toLowerCase();
    if (safe.transform === "capitalize") return raw.replace(/\b\w/g, (c) => c.toUpperCase());
    return raw;
  }, [safe.text, safe.transform]);

  if (fit === "contain") {
    // Auto-fit via SVG viewBox — measure with canvas so width matches the real font.
    const fontSize = 100;
    const measuredWidth = measureTextWidth(displayText, safe.font, safe.weight, fontSize, safe.letterSpacing);
    // tick is intentionally referenced so the memoized measurement re-runs after font load.
    void tick;
    const height = fontSize * 1.25;
    // Safe area: ~12% padding of the artwork so wide wordmarks and tall
    // lockups never touch the card edge.
    const pad = fontSize * 0.6;
    const safeMeasured = Number.isFinite(measuredWidth) && measuredWidth > 0
      ? measuredWidth
      : Math.max(1, displayText.length) * fontSize * 0.62;
    const vbWidth = Math.max(1, safeMeasured) + pad * 2;
    const vbHeight = height + pad * 2;
    return (
      <div className={`flex h-full w-full items-center justify-center overflow-hidden p-4 ${className || ""}`}>
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <text
            x={pad}
            y={pad + fontSize}
            fill={safe.color}
            fontFamily={`'${safe.font}', ui-sans-serif, system-ui, sans-serif`}
            fontWeight={safe.weight}
            fontSize={fontSize}
            letterSpacing={safe.letterSpacing * fontSize}
          >
            {displayText}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <span
      className={className}
      style={{
        fontFamily: `'${safe.font}', ui-sans-serif, system-ui, sans-serif`,
        fontWeight: safe.weight,
        color: safe.color,
        letterSpacing: `${safe.letterSpacing}em`,
        textTransform: safe.transform,
        fontSize: fontSizePx,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {displayText}
    </span>
  );
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, font: string, weight: number, size: number, letterSpacing: number): number {
  try {
    if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
    if (!_measureCtx) return text.length * size * 0.62;
    _measureCtx.font = `${weight} ${size}px '${font}', ui-sans-serif, system-ui, sans-serif`;
    const w = _measureCtx.measureText(text).width;
    return w + letterSpacing * size * Math.max(0, text.length - 1);
  } catch {
    return text.length * size * 0.62;
  }
}

/** Build an inline SVG string for export — embeds the rendered text with current font. */
export function logotypeToSvg(state: LogotypeState, opts?: { padding?: number; height?: number }): string {
  const padding = opts?.padding ?? 40;
  const fontSize = opts?.height ?? 160;
  // Estimate width: avg glyph width ~0.55em, then add letter-spacing.
  const baseWidth = state.text.length * fontSize * 0.6;
  const spacing = state.letterSpacing * fontSize * state.text.length;
  const width = Math.max(200, Math.round(baseWidth + spacing));
  const height = Math.round(fontSize * 1.3);
  const transform =
    state.transform === "uppercase" ? state.text.toUpperCase()
    : state.transform === "lowercase" ? state.text.toLowerCase()
    : state.transform === "capitalize" ? state.text.replace(/\b\w/g, c => c.toUpperCase())
    : state.text;
  const famUrl = state.font.replace(/\s+/g, "+");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width + padding * 2}" height="${height + padding * 2}" viewBox="0 0 ${width + padding * 2} ${height + padding * 2}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=${famUrl}:wght@${state.weight}&amp;display=swap');
      .lt { font-family: '${state.font}', sans-serif; font-weight: ${state.weight}; fill: ${state.color}; letter-spacing: ${state.letterSpacing}em; }
    </style>
  </defs>
  <text x="${padding}" y="${padding + fontSize}" class="lt" font-size="${fontSize}">${escapeXml(transform)}</text>
</svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Rasterize the logotype to a PNG data URL via canvas. */
export async function logotypeToPng(state: LogotypeState, scale = 2): Promise<string> {
  loadGoogleFont(state.font, [state.weight]);
  // Wait for the font to load.
  try { await (document as any).fonts?.load(`${state.weight} 160px '${state.font}'`); } catch {}
  const padding = 40;
  const fontSize = 160;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${state.weight} ${fontSize}px '${state.font}', sans-serif`;
  const transform =
    state.transform === "uppercase" ? state.text.toUpperCase()
    : state.transform === "lowercase" ? state.text.toLowerCase()
    : state.transform === "capitalize" ? state.text.replace(/\b\w/g, c => c.toUpperCase())
    : state.text;
  const metrics = ctx.measureText(transform);
  const spacing = state.letterSpacing * fontSize * Math.max(0, transform.length - 1);
  const width = Math.ceil(metrics.width + spacing + padding * 2);
  const height = Math.ceil(fontSize * 1.3 + padding * 2);
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.clearRect(0, 0, width, height);
  ctx.font = `${state.weight} ${fontSize}px '${state.font}', sans-serif`;
  ctx.fillStyle = state.color;
  ctx.textBaseline = "alphabetic";
  // Manual letter-spacing draw.
  let x = padding;
  const y = padding + fontSize;
  for (const ch of transform) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + state.letterSpacing * fontSize;
  }
  return canvas.toDataURL("image/png");
}