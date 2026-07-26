import { useEffect, useMemo, useState } from "react";
import { Layer, Stage, Rect, Circle as KCircle, Text as KText, Line as KLine, RegularPolygon, Star as KStar } from "react-konva";
import { type CanvasElement } from "@/lib/canvasAsset";
import { loadGoogleFont } from "@/lib/logotype";
import KonvaImage from "@/components/KonvaImage";

const STAGE_W = 800;
const STAGE_H = 600;
// Safe area: keep ~12% padding on every side so no logo, wordmark or icon
// ever touches the preview edge, regardless of aspect ratio.
const PADDING = Math.round(Math.min(STAGE_W, STAGE_H) * 0.12);

/**
 * Compute an axis-aligned bounding box for the visible artwork. Saved canvas
 * assets store elements in absolute coordinates that rarely fill the 800x600
 * stage — without this fit-and-center step, a logo can render as a tiny mark
 * in a corner of every Brand Kit preview.
 */
function getTextMetrics(el: Extract<CanvasElement, { kind: "text" }>) {
  const fontSize = Math.max(1, Number(el.fontSize) || 48);
  const weight = Number(el.fontWeight) || 400;
  const family = String(el.fontFamily || "Inter").trim() || "Inter";
  const text = String(el.text || "");
  let width = text.length * fontSize * 0.62;
  let ascent = fontSize * 0.82;
  let descent = fontSize * 0.24;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${weight} ${fontSize}px '${family}', ui-sans-serif, system-ui, sans-serif`;
      const measured = ctx.measureText(text);
      width = Math.max(width, measured.width);
      ascent = measured.actualBoundingBoxAscent || ascent;
      descent = measured.actualBoundingBoxDescent || descent;
    }
  } catch {}

  const height = Math.max(fontSize * 1.15, ascent + descent);
  return { width: Math.max(1, width), height: Math.max(1, height), fontSize, weight, family };
}

function textRenderBox(el: Extract<CanvasElement, { kind: "text" }>) {
  const metrics = getTextMetrics(el);
  const boxW = Math.max(1, Number(el.w) || metrics.width);
  const boxH = Math.max(1, Number(el.h) || metrics.height);
  const width = Math.max(boxW, metrics.width);
  const height = Math.max(boxH, metrics.height);
  const align = el.align || "left";
  const x = align === "center"
    ? (Number(el.x) || 0) + (boxW - width) / 2
    : align === "right"
      ? (Number(el.x) || 0) + boxW - width
      : (Number(el.x) || 0);
  const y = (Number(el.y) || 0) + (boxH - height) / 2;
  return { x, y, width, height };
}

function computeBounds(elements: CanvasElement[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.visible === false) continue;
    const bounds = el.kind === "text"
      ? textRenderBox(el)
      : { x: Number(el.x) || 0, y: Number(el.y) || 0, width: Number(el.w) || 0, height: Number(el.h) || 0 };
    const x = bounds.x;
    const y = bounds.y;
    const w = bounds.width;
    const h = bounds.height;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return { x: minX, y: minY, w, h };
}

function RenderEl({ el }: { el: CanvasElement }) {
  if (el.visible === false) return null;
  switch (el.kind) {
    case "text":
      const box = textRenderBox(el);
      return (
        <KText
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rotation={el.rotation || 0}
          text={el.text}
          fill={el.color}
          fontSize={el.fontSize}
          fontStyle={el.fontWeight >= 700 ? "bold" : "normal"}
          fontFamily={el.fontFamily}
          align={el.align || "left"}
          verticalAlign="middle"
        />
      );
    case "rect":
      return <Rect x={el.x} y={el.y} width={el.w} height={el.h} rotation={el.rotation || 0} fill={el.fill} cornerRadius={el.radius} />;
    case "circle":
      return <KCircle x={el.x + el.w / 2} y={el.y + el.h / 2} radius={Math.min(el.w, el.h) / 2} fill={el.fill} rotation={el.rotation || 0} />;
    case "image":
      return <KonvaImage el={el} />;
    case "line":
      return <KLine points={[el.x, el.y, el.x + el.w, el.y + el.h]} stroke={el.color} strokeWidth={el.thickness} />;
    case "sticky":
      return (
        <>
          <Rect x={el.x} y={el.y} width={el.w} height={el.h} fill={el.fill} cornerRadius={12} shadowBlur={8} shadowOpacity={0.12} />
          <KText x={el.x + 12} y={el.y + 12} width={el.w - 24} height={el.h - 24} text={el.text} fill={el.color} fontSize={18} fontFamily="Inter" />
        </>
      );
    case "triangle":
      return <RegularPolygon x={el.x + el.w / 2} y={el.y + el.h / 2} sides={3} radius={Math.min(el.w, el.h) / 2} fill={el.fill} rotation={(el.rotation || 0) - 90} />;
    case "star":
      return <KStar x={el.x + el.w / 2} y={el.y + el.h / 2} numPoints={5} innerRadius={Math.min(el.w, el.h) * 0.2} outerRadius={Math.min(el.w, el.h) / 2} fill={el.fill} rotation={(el.rotation || 0) - 90} />;
    case "table": {
      const rowH = el.h / Math.max(1, el.rows);
      const colW = el.w / Math.max(1, el.cols);
      return (
        <>
          <Rect x={el.x} y={el.y} width={el.w} height={el.h} fill={el.color} />
          {Array.from({ length: el.rows + 1 }).map((_, row) => (
            <KLine key={`r-${row}`} points={[el.x, el.y + row * rowH, el.x + el.w, el.y + row * rowH]} stroke={el.lineColor} strokeWidth={1} />
          ))}
          {Array.from({ length: el.cols + 1 }).map((_, col) => (
            <KLine key={`c-${col}`} points={[el.x + col * colW, el.y, el.x + col * colW, el.y + el.h]} stroke={el.lineColor} strokeWidth={1} />
          ))}
        </>
      );
    }
    default:
      return null;
  }
}

export default function CanvasAssetPreview({
  elements,
  className,
  background = "#ffffff",
}: {
  elements: CanvasElement[];
  className?: string;
  background?: string;
}) {
  const [fontRenderTick, setFontRenderTick] = useState(0);

  // Fit-and-center transform for the artwork layer. Computed once per
  // elements array so every Brand Kit surface (Logo/Icon Files, Social
  // Icons, Brand Book) renders the same normalized preview.
  const fit = useMemo(() => {
    const b = computeBounds(elements);
    if (!b) return { scale: 1, offsetX: 0, offsetY: 0 };
    const availW = STAGE_W - PADDING * 2;
    const availH = STAGE_H - PADDING * 2;
    const scale = Math.min(availW / b.w, availH / b.h);
    const offsetX = (STAGE_W - b.w * scale) / 2 - b.x * scale;
    const offsetY = (STAGE_H - b.h * scale) / 2 - b.y * scale;
    return { scale, offsetX, offsetY };
  }, [elements, fontRenderTick]);

  useEffect(() => {
    const textElements = elements.filter((el): el is Extract<CanvasElement, { kind: "text" }> => el.kind === "text");
    if (!textElements.length) return;

    let cancelled = false;
    const loadFonts = async () => {
      const uniqueFonts = new Map<string, Set<number>>();
      textElements.forEach((el) => {
        const family = String(el.fontFamily || "").trim();
        if (!family) return;
        if (!uniqueFonts.has(family)) uniqueFonts.set(family, new Set<number>());
        const weights = uniqueFonts.get(family);
        if (weights) weights.add(el.fontWeight || 400);
      });

      await Promise.all(
        Array.from(uniqueFonts.entries()).map(async ([family, weights]) => {
          const requestedWeights = Array.from(weights).sort((a, b) => a - b);
          loadGoogleFont(family, requestedWeights);
          try {
            await Promise.all(
              requestedWeights.map((weight) => (document as any).fonts?.load?.(`${weight} 48px '${family}'`) ?? Promise.resolve()),
            );
          } catch {}
        }),
      );

      if (!cancelled) setFontRenderTick((tick) => tick + 1);
    };

    void loadFonts();
    return () => {
      cancelled = true;
    };
  }, [elements]);

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ width: "100%", aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
        <Stage width={STAGE_W} height={STAGE_H} scaleX={1} scaleY={1} style={{ width: "100%", height: "100%" }}>
          <Layer>
            <Rect x={0} y={0} width={STAGE_W} height={STAGE_H} fill={background} />
          </Layer>
          <Layer x={fit.offsetX} y={fit.offsetY} scaleX={fit.scale} scaleY={fit.scale}>
            {elements.map((el) => <RenderEl key={el.id} el={el} />)}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
