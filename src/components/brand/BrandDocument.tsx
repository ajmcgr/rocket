import { useEffect, useRef, useState } from "react";
import { Copy, Download, Eye, GitBranch, Loader2, Pencil, Save } from "lucide-react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import AssetVisual, { hasVisualRenderer } from "@/components/visuals/AssetVisual";
import { tryJson } from "@/lib/assetSchemas";

const supabase = _sb as any;

function labelForKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function valueToText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(valueToText).filter(Boolean).join("\n");
  }
  return "";
}

function ContentPreview({ content }: { content: string }) {
  const parsed = tryJson<Record<string, unknown>>(content);
  const sections = parsed && !Array.isArray(parsed)
    ? Object.entries(parsed)
        .map(([key, value]) => ({ key, value: valueToText(value) }))
        .filter((section) => section.value.trim())
    : [];

  if (sections.length) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <section key={section.key} className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              {labelForKey(section.key)}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{section.value}</p>
          </section>
        ))}
      </div>
    );
  }

  const paragraphs = content.trim().split(/\n{2,}/).filter(Boolean);
  return (
    <article className="min-h-[360px] rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8">
      {paragraphs.length ? paragraphs.map((paragraph, index) => (
        <p key={index} className="max-w-3xl whitespace-pre-wrap text-[15px] leading-7 text-neutral-800">
          {paragraph}
        </p>
      )) : (
        <p className="text-sm text-neutral-500">This part of your brand is ready for you to shape.</p>
      )}
    </article>
  );
}

export default function BrandDocument({
  asset,
  onSaved,
  onVariation,
  onDuplicate,
  onExport,
}: {
  asset: any | null;
  onSaved?: () => void;
  onVariation?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState<string>(asset?.title || "");
  const [content, setContent] = useState<string>(asset?.content || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedRef = useRef({ title: asset?.title || "", content: asset?.content || "" });

  useEffect(() => {
    setTitle(asset?.title || "");
    setContent(asset?.content || "");
    savedRef.current = { title: asset?.title || "", content: asset?.content || "" };
    setDirty(false);
    setEditing(false);
  }, [asset?.id]);

  useEffect(() => {
    setDirty(title !== savedRef.current.title || content !== savedRef.current.content);
  }, [title, content]);

  const save = async () => {
    if (!asset?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("assets")
      .update({ title, content })
      .eq("id", asset.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    savedRef.current = { title, content };
    setDirty(false);
    toast({ title: "Saved" });
    onSaved?.();
  };

  // ⌘S / Ctrl+S saves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && dirty && !saving) {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const downloadText = () => {
    if (!asset) return;
    const filename =
      (title || asset.asset_type || "brand-doc")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") + ".txt";
    const body = `${title || asset.asset_type || "Untitled"}\n\n${content || ""}\n`;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!asset) {
    return (
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
        <div className="text-sm font-medium text-neutral-700">No brand asset selected</div>
        <p className="mt-1 max-w-sm text-xs text-neutral-500">
          Pick a document below, or ask Rocket on the left to draft new brand content.
        </p>
      </section>
    );
  }

  const previewAsset = { ...asset, title, content };
  const usesVisualPreview = hasVisualRenderer(previewAsset) && Boolean(tryJson(content));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {asset.asset_type?.replace(/_/g, " ") || "Brand"}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            className="mt-0.5 w-full truncate border-none bg-transparent p-0 text-xl font-semibold text-neutral-900 outline-hidden focus:ring-0"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving" : dirty ? "Save" : "Saved"}
          </button>
          <button
            onClick={() => setEditing((current) => !current)}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editing ? "Preview" : "Edit"}
          </button>
          {onVariation && (
            <button
              onClick={onVariation}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <GitBranch className="h-3.5 w-3.5" /> Variation
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              Duplicate
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              <Copy className="h-3.5 w-3.5" /> Copy text
            </button>
          )}
          <button
            onClick={downloadText}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
          >
            <Download className="h-3.5 w-3.5" /> Download text
          </button>
        </div>
      </div>
      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing…"
          className="min-h-[520px] w-full resize-y rounded-2xl border border-neutral-200 bg-white p-6 font-mono text-[13px] leading-relaxed text-neutral-800 outline-hidden focus:border-neutral-300 focus:ring-0"
        />
      ) : usesVisualPreview ? (
        <AssetVisual asset={previewAsset} />
      ) : (
        <ContentPreview content={content} />
      )}
      {dirty && (
        <div className="text-[11px] text-neutral-500">Unsaved changes — ⌘S to save.</div>
      )}
    </section>
  );
}
