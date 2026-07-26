import { forwardRef, useEffect, useState } from "react";
import { Image as KImage, Shape } from "react-konva";
import { transparentLogo } from "@/lib/logoContrast";

type ImageEl = {
  kind: "image";
  src: string;
  color?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
};

async function loadKonvaImage(src: string, keyOutBackground?: boolean): Promise<HTMLImageElement> {
  let url = src;
  if (keyOutBackground) {
    try { url = (await transparentLogo(src)).url; } catch {}
  }

  const attempt = (crossOrigin: "anonymous" | null, imageUrl: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      if (crossOrigin) image.crossOrigin = crossOrigin;
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load image"));
      image.src = imageUrl;
    });

  try { return await attempt("anonymous", url); } catch {}
  try {
    const res = await fetch(url, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try { return await attempt(null, objectUrl); } finally {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  } catch {}
  return attempt(null, url);
}

const KonvaImage = forwardRef<any, { el: ImageEl; keyOutBackground?: boolean; [k: string]: any }>(
  ({ el, keyOutBackground, ...rest }, ref) => {
    const [img, setImg] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
      let cancelled = false;
      setImg(null);
      void (async () => {
        try {
          const loaded = await loadKonvaImage(el.src, keyOutBackground);
          if (!cancelled) setImg(loaded);
        } catch {
          if (!cancelled) setImg(null);
        }
      })();
      return () => { cancelled = true; };
    }, [el.src, keyOutBackground]);
    if (el.color) {
      return (
        <Shape
          ref={ref}
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          rotation={el.rotation || 0}
          {...rest}
          sceneFunc={(context: any, shape: any) => {
            if (!img) {
              context.beginPath();
              context.rect(0, 0, el.w, el.h);
              context.closePath();
              context.fillStrokeShape(shape);
              return;
            }
            const ctx = context._context as CanvasRenderingContext2D;
            ctx.drawImage(img, 0, 0, el.w, el.h);
            ctx.save();
            ctx.globalCompositeOperation = "source-atop";
            ctx.fillStyle = el.color as string;
            ctx.fillRect(0, 0, el.w, el.h);
            ctx.restore();
            context.beginPath();
            context.rect(0, 0, el.w, el.h);
            context.closePath();
            context.fillStrokeShape(shape);
          }}
        />
      );
    }
    return (
      <KImage
        ref={ref as any}
        image={img as any}
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        rotation={el.rotation || 0}
        {...rest}
      />
    );
  }
);

KonvaImage.displayName = "KonvaImage";

export default KonvaImage;
