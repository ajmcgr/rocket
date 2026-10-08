import { NavLink, useLocation } from "@/lib/router-compat";
import { Bookmark, Compass, Layers3, Plus, User } from "lucide-react";
import { destinations } from "./primaryDestinations";

export function PrimaryNav({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className={className}>
      {destinations.map(({ label, to, matches }) => (
        <NavLink
          key={to}
          to={to}
          aria-current={matches(pathname) ? "page" : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${matches(pathname) ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function MobilePrimaryNav() {
  const { pathname } = useLocation();
  const mobile = [
    { label: "Discover", to: "/discover", Icon: Compass },
    { label: "Collections", to: "/collections", Icon: Bookmark },
    { label: "My Collections", to: "/my-collections", Icon: Bookmark },
    { label: "Submit", to: "/submit", Icon: Plus },
    { label: "My Apps", to: "/your-apps", Icon: Layers3 },
    { label: "Account", to: "/settings", Icon: User },
  ];
  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.5)] backdrop-blur-sm lg:hidden"
    >
      {mobile.map(({ label, to, Icon }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          aria-current={pathname === to ? "page" : undefined}
          className={`my-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium ${pathname === to ? "bg-neutral-200 text-neutral-900" : "text-neutral-600"}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="whitespace-nowrap">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function PublicMobileNav() {
  const { pathname } = useLocation();
  const items = [
    { label: "Discover", to: "/discover", Icon: Compass },
    { label: "Collections", to: "/collections", Icon: Bookmark },
    { label: "My Collections", to: "/my-collections", Icon: Bookmark },
    { label: "Submit", to: "/submit", Icon: Plus },
    { label: "My Apps", to: "/your-apps", Icon: Layers3 },
    { label: "Account", to: "/login", Icon: User },
  ];
  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.5)] backdrop-blur-sm lg:hidden"
    >
      {items.map(({ label, to, Icon }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          aria-current={pathname === to ? "page" : undefined}
          className={`my-1 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium ${pathname === to ? "bg-neutral-200 text-neutral-900" : "text-neutral-600"}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
