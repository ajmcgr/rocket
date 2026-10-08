import { useNavigate } from "@/lib/router-compat";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { Bookmark, LoaderCircle } from "lucide-react";
import CollectionPicker from "./CollectionPicker";

type Props = {
  appId: string;
  saved: boolean;
  onChange: (saved: boolean) => void;
  onCollectionsChanged?: () => void;
  light?: boolean;
  compact?: boolean;
};
export default function SaveAppButton({
  appId,
  saved,
  onChange,
  onCollectionsChanged,
  light = false,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const scope = `${user?.id}:${appId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  useEffect(() => {
    setOpen(false);
    setError(false);
    setBusy(false);
  }, [user?.id, appId]);
  async function setSaved(next: boolean) {
    if (!user || busy) return false;
    const requestScope = scope;
    setBusy(true);
    setError(false);
    try {
      const result = next
        ? await supabase
            .from("saved_apps")
            .insert({ user_id: user.id, app_id: appId })
        : await supabase
            .from("saved_apps")
            .delete()
            .eq("user_id", user.id)
            .eq("app_id", appId);
      if (result.error && !(result.error.code === "23505" && next))
        throw result.error;
      if (activeScope.current !== requestScope) return false;
      onChange(next);
      track(next ? "app_saved" : "app_unsaved", { app_id: appId });
      return true;
    } catch {
      if (activeScope.current === requestScope) setError(true);
      return false;
    } finally {
      if (activeScope.current === requestScope) setBusy(false);
    }
  }
  const button = (
    <button
      type="button"
      aria-label={saved ? "Manage saved app" : "Save app"}
      aria-pressed={saved}
      disabled={busy}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
          navigate(
            `/login?next=${encodeURIComponent(`/apps/${appId}?save=1`)}`,
          );
          return;
        }
        if (saved || (await setSaved(true))) setOpen(true);
      }}
      title={
        error
          ? "Could not update Saved Apps. Try again."
          : saved
            ? "Manage Saved and collections"
            : "Save app"
      }
      className={`inline-flex ${compact ? "h-11 w-11 sm:h-9 sm:w-9 rounded-lg" : "h-11 w-11 rounded-xl"} shrink-0 items-center justify-center border bg-transparent transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167ac6] ${light ? "border-white/80 text-white hover:bg-white/10" : saved ? "border-[#167ac6] text-[#167ac6] dark:text-[#dcefff]" : "border-neutral-200 text-neutral-600 hover:border-[#167ac6] hover:text-[#167ac6] dark:border-neutral-700 dark:text-neutral-200"}`}
    >
      {busy ? (
        <LoaderCircle
          aria-hidden="true"
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} animate-spin`}
        />
      ) : (
        <Bookmark
          aria-hidden="true"
          className={compact ? "h-4 w-4" : "h-5 w-5"}
          fill={saved ? "currentColor" : "none"}
        />
      )}
    </button>
  );
  return user ? (
    <CollectionPicker
      key={`${user.id}:${appId}`}
      appId={appId}
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) onCollectionsChanged?.();
      }}
      trigger={button}
      saved={saved}
      saving={busy}
      error={error}
      onSavedChange={async (next) => {
        if ((await setSaved(next)) && !next) {
          setOpen(false);
          onCollectionsChanged?.();
        }
      }}
    />
  ) : (
    button
  );
}
