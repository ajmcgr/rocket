import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  Bookmark,
  Compass,
  ExternalLink,
  Layers3,
  Plus,
  Sparkles,
  Flame,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Grid2X2,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  PenLine,
  Database,
  Search,
  MessageCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Logo from "./Logo";
import sidebarIconWhite from "@/assets/rocket-sidebar-icon-white.png.asset.json";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { MobilePrimaryNav, PublicMobileNav } from "./PrimaryNav";
import ThemeToggle from "./ThemeToggle";
import LanguageSelector from "./LanguageSelector";

type NavItem = { label: string; to: string; icon: LucideIcon; match?: string };
export const isMarketplaceSidebarItemActive = (
  label: string,
  to: string,
  pathname: string,
  search: string,
) => {
  if (label === "Buy with Rocket" || label === "Rocket ID") return pathname === to;
  return (
    pathname + search === to ||
    (to === "/discover" && pathname === "/discover" && !search) ||
    (to === "/saved-apps" && pathname === "/saved-apps") ||
    (to === "/submit" && pathname === "/submit") ||
    (to === "/create" && pathname === "/create") ||
    (label === "Developer" && pathname.startsWith("/developer"))
  );
};
const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Discover",
    items: [
      { label: "Discover", to: "/discover", icon: Compass },
      { label: "Rankings", to: "/discover?view=rankings", icon: TrendingUp },
      { label: "New", to: "/discover?view=new", icon: Flame },
      { label: "Categories", to: "/discover?view=categories", icon: Grid2X2 },
      { label: "Saved", to: "/saved-apps", icon: Bookmark },
      { label: "Library", to: "/library", icon: Layers3 },
    ],
  },
  {
    heading: "Your apps",
    items: [
      { label: "Your Apps", to: "/your-apps", icon: Layers3 },
      { label: "Submit your app", to: "/submit", icon: Plus },
    ],
  },
  {
    heading: "Create",
    items: [{ label: "Logos/Icons", to: "/create", icon: Sparkles }],
  },
  {
    heading: "Monetize",
    items: [
      { label: "Buy with Rocket", to: "/buy-with-rocket", icon: Wallet },
      { label: "Rocket ID", to: "/rocket-id", icon: ShieldCheck },
    ],
  },
];
export default function SiteHeader() {
  const [search, setSearch] = useState("");
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)
    ?.avatar_url;
  const initial = (user?.email?.[0] || "U").toUpperCase();

  useEffect(() => {
    setSidebarCompact(window.localStorage.getItem("rocket:marketplace-sidebar-compact") === "1");
    const syncSidebarPreference = (event: StorageEvent) => {
      if (event.key === "rocket:marketplace-sidebar-compact") {
        setSidebarCompact(event.newValue === "1");
      }
    };
    window.addEventListener("storage", syncSidebarPreference);
    return () => window.removeEventListener("storage", syncSidebarPreference);
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarCompact;
    window.localStorage.setItem("rocket:marketplace-sidebar-compact", next ? "1" : "0");
    setSidebarCompact(next);
  };

  const sidebarWidth = sidebarCompact ? 68 : 240;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
  };

  const navItem = ({ label, to, icon: Icon }: NavItem) => {
    const active = isMarketplaceSidebarItemActive(label, to, pathname, locationSearch);
    return (
      <Link
        key={label}
        to={to}
        title={sidebarCompact ? label : undefined}
        aria-label={sidebarCompact ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors ${sidebarCompact ? "justify-center px-0" : "px-3"} ${active ? "bg-neutral-200 text-neutral-900" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        {!sidebarCompact && <span>{label}</span>}
      </Link>
    );
  };

  return (
    <>
      <style>{`@media(min-width:1024px){*:has(>.marketplace-sidebar)>main,*:has(>.marketplace-sidebar)>header,body:has(.marketplace-sidebar) .global-site-footer{margin-left:${sidebarWidth}px}}`}</style>
      <aside className="marketplace-sidebar fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-[#e8edf2] bg-[#f9fbfd] transition-[width] duration-200 lg:flex" style={{ width: sidebarWidth }}>
        <div className={`flex h-[65px] shrink-0 items-center border-b border-[#e8edf2] ${sidebarCompact ? "justify-center px-2" : "px-4"}`}>
          {sidebarCompact ? (
            <Link to="/" aria-label="Rocket home" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-neutral-100">
              <img
                src="/rocket-sidebar-icon.png"
                alt=""
                className="sidebar-icon-light h-9 w-9 object-contain"
              />
              <img
                src={sidebarIconWhite.url}
                alt=""
                aria-hidden="true"
                className="sidebar-icon-dark h-9 w-9 object-contain"
              />
            </Link>
          ) : (
            <Logo size="md" className="max-w-[190px]" />
          )}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto pb-5 ${sidebarCompact ? "px-2" : "px-3"}`}>
          <div className={`flex h-12 items-center ${sidebarCompact ? "justify-center" : "justify-end px-1"}`}>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-[#167ac6]"
            >
              {sidebarCompact ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
          <nav aria-label="Marketplace" className="mt-1 space-y-4">
            {sections.map((section) => (
              <div key={section.heading}>
                {sidebarCompact ? <div className="mx-2 mb-2 border-t border-neutral-200" aria-hidden="true" /> : <p className="mb-1 px-3 text-xs font-semibold text-neutral-500">{section.heading}</p>}
                <div className="space-y-0.5">{section.items.map(navItem)}</div>
              </div>
            ))}
            <div>
              {sidebarCompact ? <div className="mx-2 mb-2 border-t border-neutral-200" aria-hidden="true" /> : <p className="mb-1 px-3 text-xs font-semibold text-neutral-500">Grow</p>}
              {[
                { label: "Launch", href: "https://trylaunch.ai", icon: Send },
                { label: "Post", href: "https://trypost.ai", icon: PenLine },
                { label: "Media", href: "https://trymedia.ai", icon: Database },
              ].map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={sidebarCompact ? label : undefined}
                  aria-label={sidebarCompact ? `${label} (opens in a new tab)` : undefined}
                  className={`flex min-h-9 items-center gap-3 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 ${sidebarCompact ? "justify-center px-0" : "px-3"}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  {!sidebarCompact && <><span>{label}</span><ExternalLink className="ml-auto h-3.5 w-3.5" aria-hidden="true" /></>}
                </a>
              ))}
            </div>
            <div>
              {sidebarCompact ? <div className="mx-2 mb-2 border-t border-neutral-200" aria-hidden="true" /> : <p className="mb-1 px-3 text-xs font-semibold text-neutral-500">Community</p>}
              <a
                href="https://discord.gg/aSkXPHhTjJ"
                target="_blank"
                rel="noopener noreferrer"
                title={sidebarCompact ? "Discord" : undefined}
                aria-label={sidebarCompact ? "Discord (opens in a new tab)" : undefined}
                className={`flex min-h-9 items-center gap-3 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 ${sidebarCompact ? "justify-center px-0" : "px-3"}`}
              >
                <MessageCircle className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                {!sidebarCompact && <><span>Discord</span><ExternalLink className="ml-auto h-3.5 w-3.5" aria-hidden="true" /></>}
              </a>
            </div>
          </nav>
        </div>
      </aside>
      <header className="sticky top-0 z-40 border-b border-[#e8edf2] bg-white/95 backdrop-blur-sm lg:transition-[margin-left] lg:duration-200">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)_minmax(0,1fr)]">
          <div className="lg:hidden">
            <Logo size="md" />
          </div>
          <form
            onSubmit={submitSearch}
            role="search"
            className="hidden h-10 min-w-0 max-w-lg flex-1 items-center rounded-xl border border-[#e8edf2] bg-[#f7f9fb] px-3 focus-within:border-[#167ac6] sm:flex lg:mx-auto xl:col-start-2 xl:w-full"
          >
            <span className="mr-2 text-base" aria-hidden="true">🔎</span>
            <input
              aria-label="Search apps and categories"
              placeholder="Search apps, categories..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
            <kbd className="hidden rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400 xl:block">
              ↵
            </kbd>
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap xl:col-start-3 xl:ml-0 xl:justify-self-end">
            <Link
              to="/discover"
              aria-label="Search apps"
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 sm:hidden"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>
            <LanguageSelector />
            <ThemeToggle />
            {loading ? (
              <div className="h-8 w-8 rounded-full bg-neutral-100" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#167ac6]"
                >
                  <Avatar className="h-9 w-9 border border-neutral-200">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 bg-white p-2">
                  <p className="truncate px-2 py-1.5 text-xs text-neutral-500">
                    {user.email}
                  </p>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings/billing">Billing & credits</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:block"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="hidden rounded-lg bg-[#167ac6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1268aa] sm:block"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {user ? <MobilePrimaryNav /> : <PublicMobileNav />}
    </>
  );
}
