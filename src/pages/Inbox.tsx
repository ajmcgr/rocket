import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { useAuth } from "@/contexts/AuthContext";
import { acquisitionDb as db } from "@/lib/rocketAcquisition";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

type Conversation = { id: string; app_id: string; buyer_id: string; seller_id: string; last_activity_at: string; last_message_at: string | null; last_message_sender_id: string | null; last_message_preview: string | null };
type Message = { id: string; sequence: number; conversation_id: string; sender_id: string; body: string; created_at: string; client_message_id: string; pending?: boolean };
type State = { conversation_id: string; last_read_at: string | null; archived_at: string | null };
type Profile = { user_id: string; full_name: string | null; avatar_url: string | null; username: string | null };
type App = { id: string; name: string; slug: string | null };

export default function Inbox() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("conversation");
  const startId = params.get("start");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [apps, setApps] = useState<Record<string, App>>({});
  const [blocked, setBlocked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [conversationLimit, setConversationLimit] = useState(50);
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const started = useRef<string | null>(null);
  const active = conversations.find((item) => item.id === selectedId);
  const otherId = active && user ? (active.buyer_id === user.id ? active.seller_id : active.buyer_id) : null;
  const other = otherId ? profiles[otherId] : null;
  const app = active ? apps[active.app_id] : null;
  const history = selectedId ? messages[selectedId] || [] : [];

  const refresh = useCallback(async () => {
    if (!user) return;
    const [{ data: conv, error: convError }, { data: ownStates }, { data: blocks }] = await Promise.all([
      db.from("rocket_conversations").select("id,app_id,buyer_id,seller_id,last_activity_at,last_message_at,last_message_sender_id,last_message_preview").order("last_activity_at", { ascending: false }).limit(conversationLimit),
      db.from("rocket_conversation_state").select("conversation_id,last_read_at,archived_at").eq("user_id", user.id),
      db.from("rocket_user_blocks").select("blocked_id").eq("blocker_id", user.id),
    ]);
    if (convError) { setError("Inbox could not be loaded. Please try again."); setLoading(false); return; }
    const rows = (conv || []) as Conversation[];
    if (selectedId && !rows.some((row) => row.id === selectedId)) {
      const selected = await db.from("rocket_conversations")
        .select("id,app_id,buyer_id,seller_id,last_activity_at,last_message_at,last_message_sender_id,last_message_preview")
        .eq("id", selectedId).maybeSingle();
      if (selected.data) rows.push(selected.data as Conversation);
    }
    setConversations(rows); setStates((ownStates || []) as State[]); setBlocked((blocks || []).map((row: any) => row.blocked_id));
    const participantIds = [...new Set(rows.flatMap((row) => [row.buyer_id, row.seller_id]))];
    const appIds = [...new Set(rows.map((row) => row.app_id))];
    const [profileResult, appResult] = await Promise.all([
      participantIds.length ? db.from("member_public_profiles").select("user_id,full_name,avatar_url,username").in("user_id", participantIds) : Promise.resolve({ data: [] }),
      appIds.length ? db.from("public_apps").select("id,name,slug").in("id", appIds) : Promise.resolve({ data: [] }),
    ]);
    setProfiles(Object.fromEntries(((profileResult.data || []) as Profile[]).map((row) => [row.user_id, row])));
    setApps(Object.fromEntries(((appResult.data || []) as App[]).map((row) => [row.id, row])));
    setLoading(false);
  }, [user?.id, conversationLimit, selectedId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!startId || !user || started.current === startId) return;
    started.current = startId;
    void db.rpc("start_rocket_acquisition_conversation", { p_app_id: startId }).then(async ({ data, error: startError }: any) => {
      if (startError) { setError(startError.message); started.current = null; return; }
      track("acquisition_enquiry_initiated", { app_id: startId });
      setParams({ conversation: data }, { replace: true });
      await refresh();
    });
  }, [startId, user?.id, refresh, setParams]);
  useEffect(() => {
    if (!selectedId || !user) return;
    let activeEffect = true;
    void db.from("rocket_messages").select("id,sequence,conversation_id,sender_id,body,created_at,client_message_id")
      .eq("conversation_id", selectedId).order("sequence", { ascending: false }).limit(50)
      .then(({ data, error: historyError }: any) => {
        if (!activeEffect) return;
        if (historyError) { setError("Messages could not be loaded."); return; }
        setMessages((current) => ({ ...current, [selectedId]: [...(data || [])].reverse() }));
        setHasOlder((data || []).length === 50);
        void db.from("rocket_conversation_state").update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", selectedId).eq("user_id", user.id).then(() => { void refresh(); window.dispatchEvent(new Event("rocket:inbox-read")); });
      });
    return () => { activeEffect = false; };
  }, [selectedId, user?.id]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`rocket-inbox-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rocket_messages" }, (event) => {
        const message = event.new as Message;
        // Realtime can deliver from multiple channels. Verify membership via the
        // RLS-protected conversation query before including message content.
        void db.from("rocket_conversations").select("id").eq("id", message.conversation_id).maybeSingle().then(({ data }: any) => {
          if (!data) return;
          setMessages((current) => {
            const history = current[message.conversation_id] || [];
            if (history.some((item) => item.id === message.id || item.client_message_id === message.client_message_id)) return current;
            return { ...current, [message.conversation_id]: [...history, message].sort((a, b) => a.sequence - b.sequence) };
          });
          if (message.conversation_id === selectedId && message.sender_id !== user.id) {
            void db.from("rocket_conversation_state")
              .update({ last_read_at: new Date().toISOString() })
              .eq("conversation_id", selectedId).eq("user_id", user.id)
              .then(() => window.dispatchEvent(new Event("rocket:inbox-read")));
          }
          void refresh();
        });
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, refresh, selectedId]);

  const visible = useMemo(() => conversations.filter((row) => !states.find((state) => state.conversation_id === row.id)?.archived_at), [conversations, states]);
  const unread = (row: Conversation) => {
    const read = states.find((state) => state.conversation_id === row.id)?.last_read_at;
    return !!row.last_message_at && (!read || row.last_message_at > read) && row.last_message_sender_id !== user?.id;
  };
  const send = async () => {
    if (!selectedId || !user || !draft.trim() || sending) return;
    const body = draft.trim(); const token = crypto.randomUUID();
    const pending: Message = { id: token, sequence: Number.MAX_SAFE_INTEGER, client_message_id: token, conversation_id: selectedId, sender_id: user.id, body, created_at: new Date().toISOString(), pending: true };
    setDraft(""); setSending(true); setError("");
    setMessages((current) => ({ ...current, [selectedId]: [...(current[selectedId] || []), pending] }));
    const { data, error: sendError } = await db.rpc("send_rocket_message", { p_conversation_id: selectedId, p_body: body, p_client_message_id: token });
    setSending(false);
    if (sendError) { setDraft(body); setError(sendError.message); setMessages((current) => ({ ...current, [selectedId]: (current[selectedId] || []).filter((row) => row.id !== token) })); return; }
    setMessages((current) => ({ ...current, [selectedId]: (current[selectedId] || []).map((row) => row.id === token ? data : row) }));
    track("rocket_message_sent", { conversation_type: "acquisition", app_id: active?.app_id });
    await refresh();
  };
  const loadOlder = async () => {
    if (!selectedId || !history.length) return;
    const oldest = history[0];
    const { data, error: olderError } = await db.from("rocket_messages").select("id,sequence,conversation_id,sender_id,body,created_at,client_message_id")
      .eq("conversation_id", selectedId).lt("sequence", oldest.sequence).order("sequence", { ascending: false }).limit(50);
    if (olderError) { setError("Older messages could not be loaded."); return; }
    setHasOlder((data || []).length === 50);
    setMessages((current) => ({ ...current, [selectedId]: [...(data || []).reverse(), ...(current[selectedId] || [])] }));
  };
  const archive = async () => {
    if (!selectedId || !user) return;
    const { error: archiveError } = await db.from("rocket_conversation_state").update({ archived_at: new Date().toISOString() }).eq("conversation_id", selectedId).eq("user_id", user.id);
    if (archiveError) { setError(archiveError.message); return; }
    setParams({}, { replace: true }); void refresh();
  };
  const block = async () => {
    if (!otherId || !user || !confirm(`Block ${other?.full_name || "this user"}? You will no longer be able to message each other.`)) return;
    const { error: blockError } = await db.from("rocket_user_blocks").insert({ blocker_id: user.id, blocked_id: otherId });
    if (blockError) setError(blockError.message); else { setBlocked((current) => [...current, otherId]); setError(""); }
  };
  const unblock = async () => {
    if (!otherId || !user) return;
    const { error: unblockError } = await db.from("rocket_user_blocks").delete()
      .eq("blocker_id", user.id).eq("blocked_id", otherId);
    if (unblockError) setError(unblockError.message);
    else setBlocked((current) => current.filter((id) => id !== otherId));
  };
  const report = async (messageId: string) => {
    if (!user) return;
    const reason = prompt("Why are you reporting this message? (5–500 characters)");
    if (!reason || reason.trim().length < 5) return;
    const { error: reportError } = await db.from("rocket_message_reports").insert({ message_id: messageId, reporter_id: user.id, reason: reason.trim().slice(0, 500) });
    setError(reportError ? reportError.message : "Report submitted for review.");
  };
  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
    <h1 className="text-3xl font-bold">Inbox</h1><p className="mt-1 text-sm text-neutral-600">Private conversations about apps on Rocket.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-6 grid min-h-[550px] overflow-hidden rounded-2xl border border-neutral-200 bg-white md:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden md:block" : "block"} border-r border-neutral-200`}>
        <h2 className="border-b border-neutral-200 p-4 font-semibold">Conversations</h2>
        {loading && <p className="p-4 text-sm text-neutral-600">Loading conversations…</p>}
        {!loading && visible.length === 0 && <p className="p-4 text-sm text-neutral-600">No conversations yet. Explore <Link to="/for-sale" className="text-sky-700 underline">Apps for Sale</Link> and contact a founder.</p>}
        {visible.map((row) => {
          const peerId = row.buyer_id === user?.id ? row.seller_id : row.buyer_id;
          const peer = profiles[peerId];
          return <button key={row.id} type="button" onClick={() => setParams({ conversation: row.id })} className={`flex w-full gap-3 border-b border-neutral-100 p-4 text-left hover:bg-sky-50 ${selectedId === row.id ? "bg-sky-50" : ""}`}>
            {peer?.avatar_url ? <img src={peer.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">●</span>}
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{peer?.full_name || (peer?.username ? `@${peer.username}` : "Rocket member")}</strong><time className="shrink-0 text-[10px] text-neutral-500">{new Date(row.last_activity_at).toLocaleDateString()}</time>{unread(row) && <span className="h-2.5 w-2.5 rounded-full bg-sky-600" aria-label="Unread" />}</span>
              <span className="block truncate text-xs text-neutral-500">{apps[row.app_id]?.name || "App"}</span><span className="block truncate text-xs text-neutral-500">{row.last_message_preview || "Start the conversation"}</span></span>
          </button>;
        })}
        {conversations.length === conversationLimit && <button type="button" onClick={() => setConversationLimit((value) => value + 50)} className="min-h-11 w-full text-sm font-medium text-sky-700">Load more conversations</button>}
      </aside>
      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
        {!active ? <div className="m-auto p-8 text-center text-neutral-500">Select a conversation to read messages.</div> : <>
          <div className="flex items-center gap-3 border-b border-neutral-200 p-4">
            <button type="button" onClick={() => setParams({})} className="min-h-11 rounded-lg px-2 text-sm text-sky-700 md:hidden">← Inbox</button>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{other?.full_name || (other?.username ? `@${other.username}` : "Rocket member")}</h2><p className="truncate text-xs text-neutral-600">{app?.name || "App"}</p></div>
            {app && <Link to={`/apps/${app.slug || app.id}`} className="text-xs text-sky-700 hover:underline">View app</Link>}
            <button type="button" onClick={() => void archive()} className="text-xs text-neutral-600 hover:underline">Archive</button>
            {otherId && (blocked.includes(otherId)
              ? <button type="button" onClick={() => void unblock()} className="text-xs text-sky-700 hover:underline">Unblock</button>
              : <button type="button" onClick={() => void block()} className="text-xs text-red-700 hover:underline">Block</button>)}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">
            {hasOlder && <button type="button" onClick={() => void loadOlder()} className="text-sm text-sky-700">Load older messages</button>}
            {!history.length && <p className="text-center text-sm text-neutral-500">Introduce yourself and say what you would like to know about this app.</p>}
            {history.map((message) => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words ${message.sender_id === user?.id ? "ml-auto bg-sky-100" : "bg-neutral-100"}`}>
              <p>{message.body}</p><div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-neutral-500"><time>{new Date(message.created_at).toLocaleString()}</time>{message.pending && "Sending…"}{message.sender_id !== user?.id && <button type="button" onClick={() => void report(message.id)} className="underline">Report</button>}</div>
            </div>)}
          </div>
          {otherId && blocked.includes(otherId) ? <p className="border-t p-4 text-sm text-neutral-600">You blocked this user.</p> : <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex items-end gap-2 border-t border-neutral-200 p-3">
            <label className="sr-only" htmlFor="rocket-message">Message</label><textarea id="rocket-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Write a message…" className="min-h-11 min-w-0 flex-1 resize-y rounded-xl border border-neutral-300 p-3 text-sm" />
            <button type="submit" disabled={sending || !draft.trim()} className="min-h-11 rounded-xl bg-[#167ac6] px-4 font-semibold text-white disabled:opacity-50">Send</button>
          </form>}
        </>}
      </section>
    </div>
  </main>;
}
