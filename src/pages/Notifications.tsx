import {
  CheckCheck as ControlCheckCheck,
  Trash2 as ControlTrash2,
  X as ControlX,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "@/lib/router-compat";
import {
  Bell,
  CheckCheck,
  Trash2,
  Sparkles,
  Download,
  CreditCard,
  FolderOpen,
  Info,
  X,
} from "@/components/EmojiIcons";
import {
  useNotifications,
  type NotificationKind,
} from "@/contexts/NotificationsContext";

const ICONS: Record<
  NotificationKind,
  React.ComponentType<{ className?: string }>
> = {
  asset: Sparkles,
  export: Download,
  billing: CreditCard,
  project: FolderOpen,
  system: Info,
  app: FolderOpen,
  monetize: CreditCard,
};
const ICON_BG: Record<NotificationKind, string> = {
  asset: "bg-violet-50 text-violet-600",
  export: "bg-sky-50 text-sky-600",
  billing: "bg-amber-50 text-amber-600",
  project: "bg-emerald-50 text-emerald-600",
  system: "bg-neutral-100 text-neutral-700",
  app: "bg-sky-50 text-sky-600",
  monetize: "bg-emerald-50 text-emerald-600",
};

const FILTERS: { id: "all" | "unread" | NotificationKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "app", label: "My Apps" },
  { id: "monetize", label: "Monetize" },
  { id: "asset", label: "Designs" },
  { id: "export", label: "Exports" },
  { id: "project", label: "Projects" },
  { id: "billing", label: "Billing" },
  { id: "system", label: "System" },
];

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const Notifications = () => {
  const {
    items,
    unread,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    remove,
    clearAll,
  } = useNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((i) => !i.read);
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  return (
    <div className="notification-surface mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {loading ? "Loading notifications…" : error ? "Notifications could not be refreshed." : unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            <ControlCheckCheck className="h-4 w-4" />
            Mark all read
          </button>
          <button
            onClick={() => {
              if (confirm("Clear all notifications?")) clearAll();
            }}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
          >
            <ControlTrash2 className="h-4 w-4" />
            Clear
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-neutral-200 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.id
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}{" "}
          <button onClick={refresh} className="underline">
            Retry
          </button>
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        {loading && !items.length ? (
          <div
            role="status"
            aria-label="Loading notifications"
            className="space-y-4 p-5"
          >
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-9 w-9 rounded bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-9 w-2/3 rounded bg-neutral-100 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-8 w-8 text-neutral-300" />
            <p className="mt-3 text-sm font-medium text-neutral-700">
              {error ? "Inbox unavailable" : "Nothing here"}
            </p>
            <p className="text-xs text-neutral-500">
              {error ? "Retry to load your notifications." : "Try a different filter or check back later."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {filtered.map((n) => {
              const Icon = ICONS[n.kind];
              const body = (
                <div className="flex gap-4 px-5 py-4 transition hover:bg-neutral-50">
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_BG[n.kind]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`truncate text-sm ${n.read ? "font-medium text-neutral-700" : "font-semibold text-neutral-900"}`}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-wider text-brand">
                          New
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {fmtDate(n.createdAt)}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="flex items-start">
                  {n.href ? (
                    <Link
                      to={n.href}
                      onClick={() => markRead(n.id)}
                      className="block min-w-0 flex-1"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      onClick={() => markRead(n.id)}
                      className="block min-w-0 flex-1 text-left"
                    >
                      {body}
                    </button>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    aria-label={`Dismiss ${n.title}`}
                    className="mr-4 mt-4 shrink-0 rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
                  >
                    <ControlX className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Notifications;
