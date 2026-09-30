import { Loader2 as ControlLoader2, Check as ControlCheck, Copy as ControlCopy } from "lucide-react";
import { useState } from "react";
import JSZip from "jszip";
import { Download, Loader2, Copy, Check } from "@/components/EmojiIcons";
import { useToast } from "@/hooks/use-toast";
import { logotypeToSvg, logotypeToPng } from "@/components/Logotype";
import { loadGoogleFont, type LogotypeState } from "@/lib/logotype";

function slug(s: string) {
  return (s || "logo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo";
}

function dataUrlToBlob(url: string): Blob {
  const [meta, b64] = url.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Render logotype glyph centered on a square canvas at given px size. */
async function renderSquarePng(state: LogotypeState, size: number, opts?: { bg?: string; padding?: number }): Promise<Blob> {
  loadGoogleFont(state.font, [state.weight]);
  try { await (document as any).fonts?.load(`${state.weight} ${Math.round(size * 0.6)}px '${state.font}'`); } catch {}
  const padding = opts?.padding ?? Math.round(size * 0.12);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (opts?.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, size, size); }
  const transform =
    state.transform === "uppercase" ? state.text.toUpperCase()
    : state.transform === "lowercase" ? state.text.toLowerCase()
    : state.transform === "capitalize" ? state.text.replace(/\b\w/g, c => c.toUpperCase())
    : state.text;
  // Use first glyph as favicon monogram when the text is long, otherwise full text scaled to fit.
  const glyph = transform.length > 3 ? transform.trim().charAt(0) : transform;
  let fontSize = size - padding * 2;
  ctx.font = `${state.weight} ${fontSize}px '${state.font}', sans-serif`;
  // Shrink to fit
  while (ctx.measureText(glyph).width > size - padding * 2 && fontSize > 8) {
    fontSize -= 2;
    ctx.font = `${state.weight} ${fontSize}px '${state.font}', sans-serif`;
  }
  ctx.fillStyle = state.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, size / 2, size / 2 + fontSize * 0.04);
  return await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), "image/png"));
}

/** Wordmark PNG at target height. */
async function renderWordmarkPng(state: LogotypeState, heightPx: number, opts?: { bg?: string }): Promise<Blob> {
  const dataUrl = await logotypeToPng({ ...state }, Math.max(1, heightPx / 160));
  const blob = dataUrlToBlob(dataUrl);
  if (!opts?.bg) return blob;
  // Composite onto background
  const img = new Image();
  img.src = dataUrl;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>(r => canvas.toBlob(b => r(b!), "image/png"));
}

export default function LogotypeExportBar({ state, name }: { state: LogotypeState; name?: string }) {
  const { toast } = useToast();
  const base = slug(name || state.text);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doSvg = () => {
    const svg = logotypeToSvg(state);
    download(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
  };
  const copySvg = async () => {
    await navigator.clipboard.writeText(logotypeToSvg(state));
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  };
  const doPng = async (heightPx: number, key: string, bg?: string) => {
    setBusy(key);
    try {
      const blob = await renderWordmarkPng(state, heightPx, bg ? { bg } : undefined);
      download(blob, `${base}-${heightPx}${bg ? "-onbg" : ""}.png`);
    } catch (e: any) { toast({ title: "Export failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const doPack = async () => {
    setBusy("pack");
    try {
      const zip = new JSZip();
      const logos = zip.folder("logo")!;
      const favicons = zip.folder("favicon")!;
      // Vector
      logos.file(`${base}.svg`, logotypeToSvg(state));
      // Wordmark PNGs
      for (const h of [80, 160, 320, 640]) {
        const blob = await renderWordmarkPng(state, h);
        logos.file(`${base}-${h}.png`, blob);
      }
      // Wordmark on white (for dark logos on light BG guarantee)
      logos.file(`${base}-320-on-white.png`, await renderWordmarkPng(state, 320, { bg: "#FFFFFF" }));
      // Favicon sizes (monogram)
      for (const s of [16, 32, 48, 64, 180, 192, 512]) {
        const bg = s >= 180 ? "#FFFFFF" : undefined; // app icons need opaque bg
        favicons.file(`favicon-${s}.png`, await renderSquarePng(state, s, { bg }));
      }
      // apple-touch-icon alias
      favicons.file("apple-touch-icon.png", await renderSquarePng(state, 180, { bg: "#FFFFFF" }));
      // README with HTML snippet
      favicons.file("README.txt",
        `<!-- Paste into <head> -->\n` +
        `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n` +
        `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">\n` +
        `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n` +
        `<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">\n` +
        `<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png">\n`);
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, `${base}-logo-pack.zip`);
      toast({ title: "Logo pack downloaded" });
    } catch (e: any) {
      toast({ title: "Pack failed", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const btn = "inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">Export</span>
      <button className={btn} onClick={doPack} disabled={!!busy}>
        {busy === "pack" ? <ControlLoader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Full pack (.zip)
      </button>
      <button className={btn} onClick={doSvg} disabled={!!busy}>SVG</button>
      <button className={btn} onClick={copySvg} disabled={!!busy}>
        {copied ? <ControlCheck className="h-3 w-3 text-emerald-600" /> : <ControlCopy className="h-3 w-3" />} {copied ? "Copied" : "Copy SVG"}
      </button>
      <span className="mx-1 text-[10px] text-neutral-400">PNG</span>
      {[160, 320, 640].map(h => (
        <button key={h} className={btn} onClick={() => doPng(h, `png-${h}`)} disabled={!!busy}>
          {busy === `png-${h}` ? <ControlLoader2 className="h-3 w-3 animate-spin" /> : null} {h}px
        </button>
      ))}
      <span className="mx-1 text-[10px] text-neutral-400">Favicon</span>
      <button className={btn} onClick={async () => { setBusy("fav"); try { download(await renderSquarePng(state, 512, { bg: "#FFFFFF" }), `${base}-favicon-512.png`); } finally { setBusy(null); } }} disabled={!!busy}>
        512 monogram
      </button>
    </div>
  );
}
