import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "@/lib/router-compat";
import { marketplaceRpc, marketplaceTable } from "@/lib/marketplace";
export default function MarketplaceFollowSettings() {
  const { user } = useAuth();
  const userId = user?.id;
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;
  const [loaded, setLoaded] = useState<{
      owner: string;
      targets: string[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const targets = loaded && loaded.owner === user?.id ? loaded.targets : [];
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError("");
    setBusy("");
    if (userId)
      void marketplaceTable("marketplace_follows")
        .select("target")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .then((r) => {
          if (alive) {
            if (r.error) setError("Follow preferences unavailable.");
            else
              setLoaded({
                owner: userId,
                targets: (r.data || []).map((v) => v.target),
              });
          }
        });
    return () => {
      alive = false;
    };
  }, [userId]);
  async function unsubscribe(target: string) {
    if (!user) return;
    setBusy(target);
    const r = await marketplaceRpc("set_marketplace_follow", {
      p_target: target,
      p_follow: false,
    });
    if (currentUser.current !== user.id) return;
    if (r.error) setError("Unsubscribe failed. Please retry.");
    else
      setLoaded((d) =>
        d && d.owner === user.id
          ? { ...d, targets: d.targets.filter((t) => t !== target) }
          : d,
      );
    setBusy("");
  }
  if (!user) return null;
  return (
    <details className="my-5 rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer font-semibold">
        Following and update preferences
      </summary>
      <p className="text-sm text-neutral-500">
        Only explicitly followed apps/developers send release updates.
        Unfollowing stops future notifications; existing inbox history remains.
      </p>
      {error && <p role="alert">{error}</p>}
      {loaded && !targets.length && (
        <p className="mt-3 text-sm">
          You aren’t following any apps or developers.
        </p>
      )}
      {targets.map((t) => (
        <div
          key={t}
          className="mt-3 flex flex-wrap items-center justify-between gap-2"
        >
          <Link
            className="text-sm underline"
            to={
              t.startsWith("app:") ? `/apps/${t.slice(4)}` : `/@${t.slice(10)}`
            }
          >
            {t}
          </Link>
          <button
            disabled={busy === t}
            onClick={() => void unsubscribe(t)}
            className="min-h-11 px-3 text-sm underline"
          >
            Unfollow
          </button>
        </div>
      ))}
    </details>
  );
}
