import { NavLink, useLocation } from "react-router-dom";
import { Compass, LogIn, Plus } from "lucide-react";
import { destinations } from "./primaryDestinations";

export function PrimaryNav({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  return <nav aria-label="Primary" className={className}>
    {destinations.map(({ label, to, matches }) => <NavLink key={to} to={to} aria-current={matches(pathname) ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${matches(pathname) ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}>
      {label}
    </NavLink>)}
  </nav>;
}

export function MobilePrimaryNav() {
  const { pathname } = useLocation();
  return <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.5)] backdrop-blur lg:hidden">
    {destinations.map(({ label, to, icon: Icon, matches }) => <NavLink key={to} to={to} aria-current={matches(pathname) ? "page" : undefined}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium ${matches(pathname) ? "text-sky-700" : "text-neutral-600"}`}>
      <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" /><span className="whitespace-nowrap">{label}</span>
    </NavLink>)}
  </nav>;
}

export function PublicMobileNav() {
  const { pathname } = useLocation();
  const items = [
    { label: "Discover", to: "/discover", Icon: Compass },
    { label: "Launch", to: "/launch", Icon: Plus },
    { label: "Sign in", to: "/login", Icon: LogIn },
  ];
  return <nav aria-label="Mobile primary" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-3 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.5)] backdrop-blur lg:hidden">
    {items.map(({ label, to, Icon }) => <NavLink key={to} to={to} aria-current={pathname === to ? "page" : undefined}
      className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium ${pathname === to ? "text-sky-800" : "text-neutral-600"}`}>
      <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" /><span>{label}</span>
    </NavLink>)}
  </nav>;
}
