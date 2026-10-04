import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/lib/router-compat";
import "@/components/notifications.css";

export type NotificationKind =
  "asset" | "export" | "billing" | "system" | "project" | "app" | "monetize";
export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  createdAt: number;
  read: boolean;
};
type Ctx = {
  items: Notification[];
  unread: number;
  loading: boolean;
  error: string | null;
  add: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  refresh: () => void;
};
const NotificationsContext = createContext<Ctx>({
  items: [],
  unread: 0,
  loading: false,
  error: null,
  add: () => {},
  markRead: () => {},
  markAllRead: () => {},
  remove: () => {},
  clearAll: () => {},
  refresh: () => {},
});
const LOCAL_KINDS: NotificationKind[] = [
  "asset",
  "export",
  "project",
  "system",
];
const KEY = "rocket.notifications.v1";
const db = supabase as any;
export const safeNotificationHref = (href?: string) =>
  href && /^\/[^/\\]/.test(href) && !/[\\\u0000-\u001f]/.test(href)
    ? href
    : undefined;
const fromRow = (n: any): Notification => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body || undefined,
  href: safeNotificationHref(n.href),
  createdAt: Date.parse(n.created_at),
  read: !!n.read_at,
});

// Keep real legacy Create events, but never the old fabricated welcome/logo/credit seeds.
export function legacyNotifications(userId: string): Notification[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`${KEY}.${userId}`) || "[]");
    return Array.isArray(raw)
      ? raw
          .filter(
            (n) =>
              typeof n.id === "string" &&
              n.id.startsWith("n_") &&
              LOCAL_KINDS.includes(n.kind) &&
              typeof n.title === "string",
          )
          .map((n) => ({ ...n, href: safeNotificationHref(n.href) }))
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
export const NotificationsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const [state, setState] = useState<{ owner?: string; items: Notification[] }>(
    { items: [] },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const mutations = useRef(new Map<string, number>());
  const items = state.owner === userId && userId ? state.items : [];

  const refresh = useCallback(async () => {
    if (!userId || mutations.current.get(userId)) return;
    const request = ++sequence.current;
    try {
      const result = await db
        .from("account_notifications")
        .select("id,kind,title,body,href,created_at,read_at")
        .eq("user_id", userId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (currentUser.current !== userId || request !== sequence.current)
        return;
      if (result.error) throw result.error;
      setState({
        owner: userId,
        items: [
          ...(result.data || []).map(fromRow),
          ...legacyNotifications(userId),
        ]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 100),
      });
      setError(null);
    } catch {
      if (currentUser.current === userId && request === sequence.current)
        setError("Notifications couldn't be loaded. Please try again.");
    } finally {
      if (currentUser.current === userId && request === sequence.current)
        setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    sequence.current++;
    setState({
      owner: userId,
      items: userId ? legacyNotifications(userId) : [],
    });
    setError(null);
    setLoading(!!userId);
    if (!userId) return;
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(visibleRefresh, 15000);
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    window.addEventListener("rocket:notifications-refresh", visibleRefresh);
    return () => {
      window.clearInterval(timer);
      sequence.current++;
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      window.removeEventListener(
        "rocket:notifications-refresh",
        visibleRefresh,
      );
    };
  }, [userId, refresh]);
  useEffect(() => {
    void refresh();
  }, [location.key, refresh]);

  const add = useCallback<Ctx["add"]>(
    async (n) => {
      if (!userId || !LOCAL_KINDS.includes(n.kind)) return;
      try {
        const result = await db
          .from("account_notifications")
          .insert({
            user_id: userId,
            kind: n.kind,
            title: n.title.slice(0, 180),
            body: n.body?.slice(0, 2000),
            href: safeNotificationHref(n.href),
          });
        if (result.error) throw result.error;
        if (currentUser.current === userId) void refresh();
      } catch {
        if (currentUser.current === userId)
          setError("Couldn't save this notification.");
      }
    },
    [userId, refresh],
  );
  useEffect(() => {
    const handler = (event: Event) => {
      const n = (event as CustomEvent).detail;
      if (typeof n?.title === "string")
        add({
          kind: n.kind || "system",
          title: n.title,
          body: n.body,
          href: n.href,
        });
    };
    window.addEventListener("rocket:notify", handler);
    return () => window.removeEventListener("rocket:notify", handler);
  }, [add]);

  const change = async (ids: string[], action: "read" | "dismiss", all = false) => {
    if (!userId || (!ids.length && !all)) return;
    ++sequence.current;
    const local = legacyNotifications(userId);
    const updateItems = (list: Notification[]) =>
      action === "dismiss"
        ? list.filter((n) => !all && !ids.includes(n.id))
        : list.map((n) => (all || ids.includes(n.id) ? { ...n, read: true } : n));
    try {
      localStorage.setItem(
        `${KEY}.${userId}`,
        JSON.stringify(updateItems(local)),
      );
    } catch {}
    setState((s) =>
      s.owner === userId ? { ...s, items: updateItems(s.items) } : s,
    );
    const remote = ids.filter((id) => !id.startsWith("n_"));
    if (!remote.length && !all) return;
    mutations.current.set(userId, (mutations.current.get(userId) || 0) + 1);
    try {
      const query = db
        .from("account_notifications")
        .update({
          [action === "read" ? "read_at" : "dismissed_at"]:
            new Date().toISOString(),
        })
        .eq("user_id", userId);
      const result = await (all ? query.is("dismissed_at", null) : query.in("id", remote));
      if (result.error) throw result.error;
    } catch {
      mutations.current.set(userId, (mutations.current.get(userId) || 1) - 1);
      if (currentUser.current === userId) {
        await refresh();
        if (currentUser.current === userId)
          setError("Couldn't update notifications. Please try again.");
      }
      return;
    }
    mutations.current.set(userId, (mutations.current.get(userId) || 1) - 1);
  };
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  return (
    <NotificationsContext.Provider
      value={{
        items,
        unread,
        loading,
        error,
        add,
        refresh,
        markRead: (id) => {
          void change([id], "read");
        },
        markAllRead: () => {
          void change(
            items.filter((n) => !n.read).map((n) => n.id),
            "read",
            true,
          );
        },
        remove: (id) => {
          void change([id], "dismiss");
        },
        clearAll: () => {
          void change(
            items.map((n) => n.id),
            "dismiss",
            true,
          );
        },
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};
export const useNotifications = () => useContext(NotificationsContext);
