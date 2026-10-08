import { useId, useState } from "react";
import { Globe, Lock, LoaderCircle } from "lucide-react";
import { createCollection, type Collection } from "@/lib/collections";
import { Button } from "./ui/button";

export function CollectionVisibility({
  value,
  onChange,
  disabled = false,
}: {
  value: "public" | "private";
  onChange: (value: "public" | "private") => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Visibility</legend>
      {(
        [
          {
            value: "private",
            title: "Private",
            description: "Only you can see this collection.",
            Icon: Lock,
          },
          {
            value: "public",
            title: "Public",
            description: "Anyone can view and share it.",
            Icon: Globe,
          },
        ] as const
      ).map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${value === option.value ? "border-[#167ac6] bg-[#167ac6]/5" : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"}`}
        >
          <option.Icon
            className="h-4 w-4 shrink-0 text-neutral-500"
            aria-hidden="true"
          />
          <span className="flex-1">
            <span className="block text-sm font-medium">{option.title}</span>
            <span className="block text-xs text-neutral-500">
              {option.description}
            </span>
          </span>
          <input
            type="radio"
            name={`collection-visibility-${id}`}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 accent-[#167ac6]"
            aria-label={option.title}
          />
        </label>
      ))}
    </fieldset>
  );
}
export const collectionInputClass =
  "mt-2 block min-h-11 w-full rounded-xl border border-neutral-200 bg-transparent px-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-[#167ac6] focus:ring-2 focus:ring-[#167ac6]/15 dark:border-neutral-700";

export default function CollectionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (collection: Collection) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !name.trim()) return;
        setBusy(true);
        setError(false);
        try {
          const collection = await createCollection(name, visibility);
          onCreated(collection);
          setName("");
          setVisibility("private");
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
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My favourite AI tools"
          className={collectionInputClass}
        />
      </label>
      <CollectionVisibility
        value={visibility}
        onChange={setVisibility}
        disabled={busy}
      />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          Could not create the collection. Please try again.
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
        <Button disabled={busy || !name.trim()} type="submit">
          {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {busy ? "Creating…" : "Create collection"}
        </Button>
      </div>
    </form>
  );
}
