import { Check as ControlCheck, Copy as ControlCopy, FileText as ControlFileText, FileDown as ControlFileDown } from "lucide-react";
import { useState } from "react";
import { Copy, Check, FileText, FileDown } from "@/components/EmojiIcons";
import { tryJson } from "@/lib/assetSchemas";
import {
  brandVoiceToMarkdown, brandGuidelinesToMarkdown, founderBioToMarkdown,
  launchCopyToMarkdown, productHuntCopyToMarkdown,
} from "@/lib/assetToMarkdown";

function slug(s: string) {
  return (s || "asset").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function serialize(asset: any): string | null {
  const json = tryJson(asset?.content || "");
  if (!json) return null;
  const t = asset.asset_type;
  const title = asset.title || undefined;
  if (t === "brand_voice") return brandVoiceToMarkdown(json, title);
  if (t === "brand_guidelines") return brandGuidelinesToMarkdown(json);
  if (t === "founder_bio") return founderBioToMarkdown(json, title);
  if (t === "launch_copy") return launchCopyToMarkdown(json, title);
  if (t === "product_hunt_copy") return productHuntCopyToMarkdown(json, title);
  return null;
}

export function hasMarkdownExport(asset: any): boolean {
  return ["brand_voice", "brand_guidelines", "founder_bio", "launch_copy", "product_hunt_copy"].includes(asset?.asset_type);
}

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printAsPdf(html: string, title: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body { font: 15px/1.6 -apple-system,Segoe UI,Roboto,Inter,sans-serif; color:#111; max-width:720px; margin:48px auto; padding:0 24px; }
    h1 { font-size: 28px; margin: 0 0 24px; letter-spacing:-0.01em; }
    h2 { font-size: 18px; margin: 32px 0 8px; letter-spacing:-0.01em; }
    h3 { font-size: 14px; margin: 20px 0 6px; text-transform:uppercase; letter-spacing:0.06em; color:#555; }
    p, li { font-size: 14px; }
    ul { padding-left: 18px; }
    blockquote { margin: 8px 0; padding: 6px 12px; border-left: 3px solid #d4d4d8; color:#374151; font-style: italic; }
    hr { border: 0; border-top: 1px solid #e5e5e5; margin: 24px 0; }
    @media print { body { margin: 24px; } }
  </style></head><body>${html}<script>window.onload=()=>{setTimeout(()=>window.print(),200)}</script></body></html>`);
  w.document.close();
}

// Extremely small markdown → HTML for our controlled output.
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  const inline = (s: string) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (line.startsWith("> ")) { closeList(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); continue; }
    if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`); continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

export default function TextAssetExportBar({ asset }: { asset: any }) {
  const [copied, setCopied] = useState(false);
  const md = serialize(asset);
  if (!md) return null;
  const base = slug(asset.title || asset.asset_type);
  const btn = "inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 hover:bg-neutral-50";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">Export</span>
      <button className={btn} onClick={async () => { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        {copied ? <ControlCheck className="h-3 w-3 text-emerald-600" /> : <ControlCopy className="h-3 w-3" />} {copied ? "Copied" : "Copy Markdown"}
      </button>
      <button className={btn} onClick={() => download(`${base}.md`, md, "text/markdown")}>
        <ControlFileText className="h-3 w-3" /> Markdown (.md)
      </button>
      <button className={btn} onClick={() => download(`${base}.txt`, md.replace(/[#>*_]/g, ""), "text/plain")}>
        Plain text
      </button>
      <button className={btn} onClick={() => printAsPdf(mdToHtml(md), asset.title || "Export")}>
        <ControlFileDown className="h-3 w-3" /> Print / PDF
      </button>
    </div>
  );
}
