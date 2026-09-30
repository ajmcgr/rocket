import { useEffect, useRef, useState } from "react";
import { supabase as _sb } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
const supabase = _sb as any;

type Comment = {
  id: string;
  asset_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_email?: string | null;
};

export default function CommentsPanel({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, asset_id, user_id, body, created_at")
      .eq("asset_id", assetId)
      .order("created_at", { ascending: true });
    if (error) { setLoading(false); return; } // table may not exist yet
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [assetId]);

  useEffect(() => {
    const ch = supabase
      .channel(`comments:${assetId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `asset_id=eq.${assetId}` }, (payload: any) => {
        setItems((prev) => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments", filter: `asset_id=eq.${assetId}` }, (payload: any) => {
        setItems((prev) => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [assetId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [items.length]);

  const post = async () => {
    const text = body.trim();
    if (!text || !user) return;
    setPosting(true);
    const { error } = await supabase.from("comments").insert({ asset_id: assetId, user_id: user.id, body: text });
    setPosting(false);
    if (error) { toast({ title: "Couldn't post", description: error.message, variant: "destructive" }); return; }
    setBody("");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
        <MessageSquare className="h-4 w-4 text-neutral-500" /> Comments {items.length > 0 && <span className="rounded-full bg-neutral-100 px-1.5 text-[10px]">{items.length}</span>}
      </div>
      {loading ? (
        <div className="py-4 text-xs text-neutral-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-3 text-xs text-neutral-500">No comments yet. Kick off the thread.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="group flex gap-3">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-100 text-[11px] font-medium text-neutral-700">
                {(c.user_id.slice(0, 1) || "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-neutral-800">{c.user_id === user?.id ? "You" : `User ${c.user_id.slice(0, 6)}`}</span>
                  <span className="text-[10px] text-neutral-400">{new Date(c.created_at).toLocaleString()}</span>
                  {c.user_id === user?.id && (
                    <button onClick={() => remove(c.id)} className="ml-auto rounded p-1 text-neutral-400 opacity-0 hover:text-red-600 group-hover:opacity-100" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">{c.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div ref={bottomRef} />
      {user ? (
        <div className="mt-4 flex gap-2 border-t border-neutral-100 pt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post(); }}
            placeholder="Write a comment… (⌘↵ to send)"
            className="min-h-[42px] flex-1 resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-hidden focus:border-brand"
          />
          <button onClick={post} disabled={posting || !body.trim()} className="inline-flex items-center gap-1.5 self-end rounded-full bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50">
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <div className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">Sign in to leave a comment.</div>
      )}
    </div>
  );
}