import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { DialogClose, DialogContent } from "./ui/dialog";
import { cn } from "@/lib/utils";

export function CollectionDialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      {...props}
      motion="gentle"
      showCloseButton={false}
      className={cn(
        "w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-3xl border-neutral-200 p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100",
        className,
      )}
    >
      {children}
      <DialogClose asChild>
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-[#167ac6] dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </DialogClose>
    </DialogContent>
  );
}
