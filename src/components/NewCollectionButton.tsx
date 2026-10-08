import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { CollectionDialogContent } from "./CollectionDialog";
import CollectionForm from "./CollectionForm";
import { Button } from "./ui/button";
import type { Collection } from "@/lib/collections";
export default function NewCollectionButton({
  onCreated,
}: {
  onCreated: (collection: Collection) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          New collection
        </Button>
      </DialogTrigger>
      <CollectionDialogContent>
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="text-xl">New collection</DialogTitle>
          <DialogDescription>
            A home for apps you want to keep together.
          </DialogDescription>
        </DialogHeader>
        <CollectionForm
          onCancel={() => setOpen(false)}
          onCreated={(collection) => {
            onCreated(collection);
            setOpen(false);
          }}
        />
      </CollectionDialogContent>
    </Dialog>
  );
}
