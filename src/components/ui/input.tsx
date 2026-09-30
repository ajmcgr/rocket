import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-neutral-700 placeholder:text-neutral-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
