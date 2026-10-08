import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import {
  updateCollection,
  deleteCollection,
  type Collection,
} from "@/lib/collections";
import { CollectionVisibility, collectionInputClass } from "./CollectionForm";
import { Button } from "./ui/button";
export default function CollectionSettings({
  collection,
  onSaved,
  onDeleted,
}: {
  collection: Collection;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(collection.name);
  const [visibility, setVisibility] = useState(
    collection.visibility || "private",
  );
  const [confirm, setConfirm] = useState<"publish" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const changed =
    name.trim() !== collection.name || visibility !== collection.visibility;
  async function perform(action: "save" | "delete") {
    if (busy || !collection.id) return;
    setBusy(true);
    setError(false);
    try {
      if (action === "delete") {
        await deleteCollection(collection.id);
        onDeleted();
      } else {
        await updateCollection(collection.id, {
          name: name.trim(),
          visibility,
        });
        onSaved();
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (confirm)
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">
          {confirm === "delete"
            ? "Delete this collection?"
            : "Make this collection public?"}
        </h3>
        <p className="text-sm leading-relaxed text-neutral-500">
          {confirm === "delete"
            ? `“${collection.name}” will be deleted. Your Saved apps, app listings and purchases stay unchanged.`
            : "Anyone will be able to view this collection and the publicly listed apps in it."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            Could not update this collection. Please try again.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setConfirm(null);
              setError(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant={confirm === "delete" ? "destructive" : "default"}
            disabled={busy}
            onClick={() =>
              void perform(confirm === "delete" ? "delete" : "save")
            }
          >
            {busy && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {confirm === "delete" ? "Delete collection" : "Make public"}
          </Button>
        </div>
      </div>
    );
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !changed) return;
        if (visibility === "public" && collection.visibility !== "public")
          setConfirm("publish");
        else void perform("save");
      }}
    >
      <label className="block text-sm font-medium">
        Collection name
        <input
          required
          maxLength={80}
          className={collectionInputClass}
          disabled={busy}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <CollectionVisibility
        value={visibility}
        onChange={setVisibility}
        disabled={busy}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not update this collection. Please try again.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <Button
          type="button"
          variant="ghost"
          className="px-0 text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={busy}
          onClick={() => {
            setConfirm("delete");
            setError(false);
          }}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
        <Button type="submit" disabled={busy || !changed || !name.trim()}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
