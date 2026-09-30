import { ChevronDown, ExternalLink } from "lucide-react";
import { Link } from "@/lib/router-compat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export default function EcosystemSwitcher({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Choose Rocket or Launch"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition hover:border-sky-300"
      >
        <span>
          <span className="block text-xs font-bold uppercase tracking-[.15em] text-sky-700">
            Rocket
          </span>
          {!compact && (
            <span className="block text-[11px] text-neutral-500">
              Monetize your app
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-neutral-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 border-neutral-200 bg-white p-1.5"
      >
        <DropdownMenuItem asChild>
          <Link to="/" className="block rounded-lg px-3 py-2">
            <span className="block font-semibold">Rocket</span>
            <span className="text-xs text-neutral-500">Monetize your app</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://trylaunch.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg px-3 py-2"
          >
            <span>
              <span className="block font-semibold">Launch</span>
              <span className="text-xs text-neutral-500">Launch your app</span>
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
