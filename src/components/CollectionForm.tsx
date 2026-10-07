import { useState } from "react";
import { createCollection, type Collection } from "@/lib/collections";

export default function CollectionForm({
  onCreated,
}: {
  onCreated: (collection: Collection) => void;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(false);
        try {
          const collection = await createCollection(name, visibility);
          setName("");
          setVisibility("private");
          onCreated(collection);
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm font-medium">
        Collection name
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block min-h-11 w-full rounded-xl border bg-transparent px-3"
        />
      </label>
      <label className="block text-sm font-medium">
        Visibility
        <select
          value={visibility}
          onChange={(e) =>
            setVisibility(e.target.value as "public" | "private")
          }
          className="ml-3 min-h-11 rounded-xl border bg-white px-3 text-neutral-900"
        >
          <option value="private">Private — only you</option>
          <option value="public">Public — anyone</option>
        </select>
      </label>
      <button
        disabled={busy || !name.trim()}
        className="min-h-11 rounded-xl bg-[#469DDA] px-4 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create collection"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not create the collection. Please try again.
        </p>
      )}
    </form>
  );
}
