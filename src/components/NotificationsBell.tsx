import {
  Bell as ControlBell,
  CheckCheck as ControlCheckCheck,
  X as ControlX,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import {
  Bell,
  CheckCheck,
  Sparkles,
  Download,
  CreditCard,
  FolderOpen,
  Info,
  X,
} from "@/components/EmojiIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
};

const NotificationsBell = () => {
  const {
    items,
    unread,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    remove,
  } = useNotifications();
  const preview = items.slice(0, 6);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) refresh();
      }}
    >
      <DropdownMenuTrigger
        data-tour="nav-notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-neutral-700 outline-hidden transition hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-300"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <ControlBell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="notification-surface w-[min(360px,calc(100vw-2rem))] bg-white rounded-xl border border-neutral-200 shadow-lg p-0"
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-neutral-100">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Notifications
            </p>
            <p className="text-[11px] text-neutral-500">
              {unread ? `${unread} unread` : "All caught up"}
            </p>
          </div>
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40"
          >
            <ControlCheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {preview.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-neutral-300" />
              <p className="mt-2 text-sm font-medium text-neutral-700">
                {loading ? "Loading notifications…" : "No notifications"}
              </p>
              <p className="text-xs text-neutral-500">
                New activity will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {preview.map((n) => {
                const Icon = ICONS[n.kind];
                const inner = (
                  <div className="flex gap-3 px-4 py-3 transition hover:bg-neutral-50">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_BG[n.kind]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`truncate text-sm ${n.read ? "font-medium text-neutral-700" : "font-semibold text-neutral-900"}`}
                        >
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(n.id);
                      }}
                      aria-label="Dismiss"
                      className="self-start rounded p-1 text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600"
                    >
                      <ControlX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        to={n.href}
                        onClick={() => markRead(n.id)}
                        className="block"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        onClick={() => markRead(n.id)}
                        className="block w-full text-left"
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="px-4 py-2 text-xs text-red-600">
            {error}{" "}
            <button onClick={refresh} className="underline">
              Retry
            </button>
          </p>
        )}
        <div className="border-t border-neutral-100 p-2">
          <Link
            to="/notifications"
            className="block rounded-md px-3 py-2 text-center text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationsBell;
