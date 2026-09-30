import { MessageSquarePlus as ControlMessageSquarePlus, PinOff as ControlPinOff, Pin as ControlPin, Loader2 as ControlLoader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, MessageSquarePlus, Pin, PinOff } from "@/components/EmojiIcons";

export type StudioTurn = {
  id: string;
  role: "user" | "rocket";
  text: string;
  ts: number;
};

function keyFor(projectId: string) {
  return `rocket:studio:chat:${projectId}`;
}
function pinKey(projectId: string) {
  return `rocket:studio:pins:${projectId}`;
}

export function loadTurns(projectId: string): StudioTurn[] {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    return raw ? (JSON.parse(raw) as StudioTurn[]) : [];
  } catch {
    return [];
  }
}
export function saveTurns(projectId: string, turns: StudioTurn[]) {
  try {
    localStorage.setItem(keyFor(projectId), JSON.stringify(turns.slice(-200)));
  } catch {}
}

export default function StudioLeftPanel({
  projectId,
  busy,
  onSend,
  onNewChat,
}: {
  projectId: string;
  busy: boolean;
  onSend: (prompt: string) => Promise<void> | void;
  onNewChat?: () => void;
}) {
  const [turns, setTurns] = useState<StudioTurn[]>(() => loadTurns(projectId));
  const [pins, setPins] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(pinKey(projectId));
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTurns(loadTurns(projectId));
  }, [projectId]);

  useEffect(() => {
    saveTurns(projectId, turns);
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [turns, projectId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [projectId]);

  const togglePin = (id: string) => {
    setPins((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id];
      try {
        localStorage.setItem(pinKey(projectId), JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userTurn: StudioTurn = { id: crypto.randomUUID(), role: "user", text, ts: Date.now() };
    setTurns((t) => [...t, userTurn]);
    setInput("");
    try {
      await onSend(text);
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "rocket",
          text: "Working on it — the new deliverable will appear in the workspace.",
          ts: Date.now(),
        },
      ]);
    } catch (e: any) {
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "rocket",
          text: `Couldn't finish that: ${e?.message || "unknown error"}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const pinned = turns.filter((t) => pins.includes(t.id));

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <div className="text-[10px] font-semibold normal-case tracking-[0.18em] text-neutral-500">
          Conversation
        </div>
        <button
          onClick={() => {
            if (confirm("Start a new chat? History for this project will be cleared.")) {
              setTurns([]);
              onNewChat?.();
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2 py-1 text-[10px] text-neutral-600 hover:bg-neutral-50"
        >
          <ControlMessageSquarePlus className="h-3 w-3" /> New
        </button>
      </div>
      {pinned.length > 0 && (
        <div className="border-b border-neutral-100 bg-amber-50/60 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold normal-case tracking-wider text-amber-700">
            Pinned
          </div>
          <div className="space-y-1">
            {pinned.map((t) => (
              <div key={t.id} className="line-clamp-2 text-[11px] text-amber-900">
                {t.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {turns.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-500">
            Start the conversation. Ask Rocket to create or refine your brand.
          </div>
        )}
        {turns.map((t) => {
          const mine = t.role === "user";
          return (
            <div key={t.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`group relative max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                  mine ? "bg-brand text-brand-foreground" : "bg-neutral-100 text-neutral-800"
                }`}
              >
                <div className="whitespace-pre-wrap">{t.text}</div>
                <div className="mt-1 text-[10px] opacity-60">
                  {new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <button
                  onClick={() => togglePin(t.id)}
                  className="absolute -right-2 -top-2 hidden rounded-full border border-neutral-200 bg-white p-1 text-neutral-500 shadow-xs group-hover:block"
                  title={pins.includes(t.id) ? "Unpin" : "Pin"}
                >
                  {pins.includes(t.id) ? <ControlPinOff className="h-3 w-3" /> : <ControlPin className="h-3 w-3" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-neutral-100 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-2 focus-within:border-brand">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Refine your brand… e.g. make the icon smaller, generate a favicon"
            className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 text-[13px] outline-hidden placeholder:text-neutral-400"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-foreground disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <ControlLoader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
