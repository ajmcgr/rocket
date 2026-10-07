import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "@/lib/router-compat";
import { marketplaceRpc, marketplaceTable } from "@/lib/marketplace";
export default function MarketplaceFollow({
  target,
  label,
}: {
  target: string;
  label: string;
}) {
  const { user } = useAuth();
  const userId = user?.id;
  const identity = `${user?.id || ""}:${target}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{
    owner: string;
    target: string;
    following: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ready =
    !!loaded && loaded.owner === user?.id && loaded.target === target;
  const following = ready && loaded?.following;
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setError("");
    setBusy(false);
    if (userId)
      void marketplaceTable("marketplace_follows")
        .select("target")
        .eq("user_id", userId)
        .eq("target", target)
        .maybeSingle()
        .then(
          (r) => {
            if (alive) {
              if (r.error) setError("Follow settings unavailable.");
              else setLoaded({ owner: userId, target, following: !!r.data });
            }
          },
          () => {
            if (alive) setError("Follow settings unavailable.");
          },
        );
    return () => {
      alive = false;
    };
  }, [userId, target, retry]);
  const toggle = async () => {
    if (!user || !ready) return;
    setBusy(true);
    setError("");
    const result = await marketplaceRpc("set_marketplace_follow", {
      p_target: target,
      p_follow: !following,
    });
    if (currentIdentity.current !== identity) return;
    if (result.error) setError("Could not update your follow preference.");
    else setLoaded({ owner: user.id, target, following: !following });
    setBusy(false);
  };
  return (
    <div className="mt-3 text-sm">
      {user ? (
        <button
          disabled={busy || !ready}
          onClick={toggle}
          className="min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-50"
        >
          {following ? `Unfollow ${label}` : `Follow ${label}`}
        </button>
      ) : (
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center underline"
        >
          Sign in to follow {label}
        </Link>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        Opt in to release updates in your Rocket inbox. Unfollow here or in
        Notifications to stop future updates.
      </p>
      {error && <p role="alert">{error}</p>}
      {user && error && !ready && (
        <button
          onClick={() => setRetry((r) => r + 1)}
          className="min-h-11 underline"
        >
          Retry follow settings
        </button>
      )}
    </div>
  );
}
