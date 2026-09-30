import { useEffect, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { X, RotateCcw, Save, Trash2, Pencil, Check, Loader2, Clock } from "lucide-react";
import { diffLines } from "@/lib/aiErrors";
const supabase = _sb as any;

type Snapshot = { editor_state?: any; content?: string | null; image_url?: string | null; title?: string | null };
type Version = { id: string; label: string | null; snapshot: Snapshot; created_at: string };

interface Props {
  open: boolean;
  onClose: () => void;
  asset: any;
  onRestored: () => void;
}

const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const SnapshotView = ({ snap, fallbackTitle }: { snap: Snapshot; fallbackTitle?: string }) => (
  <div className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
    <div className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 truncate">{snap.title || fallbackTitle || "Untitled"}</div>
    <div className="flex-1 overflow-auto">
      {snap.image_url ? (
        <div className="flex h-full items-center justify-center bg-neutral-50 p-4">
          <img src={snap.image_url} alt="" className="max-h-[420px] w-auto" />
        </div>
      ) : (
        <pre className="whitespace-pre-wrap p-4 font-sans text-xs leading-relaxed text-neutral-800">{snap.content || "(empty)"}</pre>
      )}
    </div>
  </div>
);

const DiffView = ({ before, after }: { before: string; after: string }) => {
  const segs = diffLines(before, after);
  const adds = segs.filter(s => s.type === "add").length;
  const dels = segs.filter(s => s.type === "del").length;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 text-xs">
        <span className="font-medium text-neutral-700">Changes</span>
        <span className="text-[10px]">
          <span className="mr-2 text-emerald-600">+{adds}</span>
          <span className="text-red-600">−{dels}</span>
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
        {segs.length === 0 ? (
          <div className="text-neutral-400">(no differences)</div>
        ) : segs.map((s, i) => (
          <div
            key={i}
            className={
              s.type === "add" ? "bg-emerald-50 text-emerald-800 px-2 border-l-2 border-emerald-400"
              : s.type === "del" ? "bg-red-50 text-red-800 px-2 border-l-2 border-red-400 line-through decoration-red-300/70"
              : "text-neutral-600 px-2 border-l-2 border-transparent"
            }
          >
            <span className="mr-1 text-neutral-400 select-none">{s.type === "add" ? "+" : s.type === "del" ? "−" : " "}</span>
            {s.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
};

const VersionHistoryDrawer = ({ open, onClose, asset, onRestored }: Props) => {
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compare, setCompare] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!asset?.id) return;
    setLoading(true);
    const { data } = await supabase.from("asset_versions").select("id, label, snapshot, created_at").eq("asset_id", asset.id).order("created_at", { ascending: false });
    const list = (data || []) as Version[];
    setVersions(list);
    if (list.length && !selectedId) setSelectedId(list[0].id);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open, asset?.id]);

  if (!open) return null;

  const selected = versions.find(v => v.id === selectedId) || null;

  const saveCurrent = async () => {
    setBusy("save");
    const label = prompt("Label this version (optional):", "Manual snapshot") ?? "Manual snapshot";
    const { error } = await supabase.from("asset_versions").insert({
      asset_id: asset.id, user_id: asset.user_id, label,
      snapshot: { editor_state: asset.editor_state, content: asset.content, image_url: asset.image_url, title: asset.title },
    });
    setBusy(null);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Version saved" });
    load();
  };

  const restore = async (v: Version) => {
    if (!confirm(`Restore "${v.label || "Snapshot"}"? Current state will be saved first.`)) return;
    setBusy(`restore-${v.id}`);
    await supabase.from("asset_versions").insert({
      asset_id: asset.id, user_id: asset.user_id, label: "Auto-saved before restore",
      snapshot: { editor_state: asset.editor_state, content: asset.content, image_url: asset.image_url, title: asset.title },
    });
    const { error } = await supabase.from("assets").update({
      editor_state: v.snapshot.editor_state ?? null,
      content: v.snapshot.content ?? null,
      image_url: v.snapshot.image_url ?? null,
      title: v.snapshot.title ?? asset.title,
    }).eq("id", asset.id);
    setBusy(null);
    if (error) { toast({ title: "Restore failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Version restored" });
    onRestored();
    load();
  };

  const del = async (v: Version) => {
    if (!confirm("Delete this version permanently?")) return;
    setBusy(`del-${v.id}`);
    await supabase.from("asset_versions").delete().eq("id", v.id);
    setBusy(null);
    if (selectedId === v.id) setSelectedId(null);
    load();
  };

  const saveLabel = async (v: Version) => {
    setBusy(`lbl-${v.id}`);
    await supabase.from("asset_versions").update({ label: labelDraft }).eq("id", v.id);
    setEditingLabelId(null);
    setBusy(null);
    load();
  };

  const currentSnap: Snapshot = { editor_state: asset.editor_state, content: asset.content, image_url: asset.image_url, title: asset.title };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40" onClick={onClose}>
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-500" />
            <h2 className="text-sm font-semibold">Version history</h2>
            <span className="text-xs text-neutral-500">{versions.length} {versions.length === 1 ? "version" : "versions"}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare with current
            </label>
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input type="checkbox" checked={showDiff} onChange={e => setShowDiff(e.target.checked)} disabled={!compare} /> Diff view
            </label>
            <button onClick={saveCurrent} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50">
              {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save current as version
            </button>
            <button onClick={onClose} className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-[280px_1fr] overflow-hidden">
          <aside className="overflow-y-auto border-r border-neutral-200 bg-neutral-50/50">
            {loading ? (
              <div className="p-6 text-center text-xs text-neutral-500">Loading…</div>
            ) : versions.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">No saved versions yet.</div>
            ) : (
              <ul className="divide-y divide-neutral-200">
                {versions.map((v, i) => (
                  <li key={v.id}>
                    <button onClick={() => setSelectedId(v.id)} className={`w-full px-3 py-2.5 text-left ${selectedId === v.id ? "bg-white" : "hover:bg-white/60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {editingLabelId === v.id ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input autoFocus value={labelDraft} onChange={e => setLabelDraft(e.target.value)} className="w-full rounded border border-neutral-200 px-1.5 py-0.5 text-xs outline-hidden focus:border-brand" />
                              <button onClick={() => saveLabel(v)} className="text-emerald-600"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingLabelId(null)}><X className="h-3.5 w-3.5 text-neutral-400" /></button>
                            </div>
                          ) : (
                            <div className="truncate text-xs font-medium text-neutral-900">{v.label || `Snapshot ${versions.length - i}`}</div>
                          )}
                          <div className="mt-0.5 text-[10px] text-neutral-500">{fmtDate(v.created_at)}</div>
                        </div>
                        <div className="flex shrink-0 gap-0.5 opacity-60">
                          <button onClick={(e) => { e.stopPropagation(); setEditingLabelId(v.id); setLabelDraft(v.label || ""); }} title="Rename" className="rounded p-1 hover:bg-neutral-100"><Pencil className="h-3 w-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); del(v); }} title="Delete" className="rounded p-1 text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex flex-col overflow-hidden bg-neutral-50 p-5">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-xs text-neutral-500">Select a version on the left to preview.</div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{selected.label || "Snapshot"}</div>
                    <div className="text-xs text-neutral-500">{fmtDate(selected.created_at)}</div>
                  </div>
                  <button onClick={() => restore(selected)} disabled={busy === `restore-${selected.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50">
                    {busy === `restore-${selected.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore this version
                  </button>
                </div>
                <div className={`flex-1 overflow-hidden grid gap-3 ${compare ? "grid-cols-2" : "grid-cols-1"}`}>
                  {compare && showDiff && !currentSnap.image_url && !selected.snapshot.image_url ? (
                    <div className="col-span-2 flex flex-col overflow-hidden">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Diff · this version → current</div>
                      <div className="flex-1 overflow-hidden">
                        <DiffView before={selected.snapshot.content || ""} after={currentSnap.content || ""} />
                      </div>
                    </div>
                  ) : (<>
                  {compare && (
                    <div className="flex flex-col overflow-hidden">
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">Current</div>
                      <div className="flex-1 overflow-hidden"><SnapshotView snap={currentSnap} fallbackTitle={asset.title} /></div>
                    </div>
                  )}
                  <div className="flex flex-col overflow-hidden">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">{compare ? "This version" : selected.label || "Snapshot"}</div>
                    <div className="flex-1 overflow-hidden"><SnapshotView snap={selected.snapshot} /></div>
                  </div>
                  </>)}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryDrawer;