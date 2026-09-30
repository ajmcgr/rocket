import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Layers3,
  LogIn,
  Plus,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Grid2X2,
  Menu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Logo from "./Logo";
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
import EcosystemSwitcher from "./EcosystemSwitcher";

const LANGUAGES = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "nl", flag: "🇳🇱", label: "Nederlands" },
  { code: "pl", flag: "🇵🇱", label: "Polski" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
];

type NavItem = { label: string; to: string; icon: LucideIcon; match?: string };
const sections: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Discover",
    items: [
      { label: "Discover", to: "/discover", icon: Compass },
      { label: "Rising", to: "/discover?view=rising", icon: TrendingUp },
      { label: "New", to: "/discover?view=new", icon: Sparkles },
      { label: "Categories", to: "/discover?view=categories", icon: Grid2X2 },
      { label: "Saved", to: "/saved-apps", icon: Bookmark },
    ],
  },
  {
    heading: "Your apps",
    items: [
      { label: "Your Apps", to: "/your-apps", icon: Layers3 },
      { label: "Launch an app", to: "/launch", icon: Plus },
    ],
  },
  {
    heading: "Monetize",
    items: [
      { label: "Revenue in Your Apps", to: "/your-apps", icon: Wallet },
      { label: "Rocket Identity", to: "/developer", icon: ShieldCheck },
    ],
  },
  {
    heading: "Create",
    items: [{ label: "Create branding", to: "/create", icon: Sparkles }],
  },
];
export default function SiteHeader() {
  const [lang, setLang] = useState(LANGUAGES[0]);
  const [search, setSearch] = useState("");
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)
    ?.avatar_url;
  const initial = (user?.email?.[0] || "U").toUpperCase();

  useEffect(() => {
    const code = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i)?.[1];
    const found = LANGUAGES.find((item) => item.code === code);
    if (found) setLang(found);
  }, []);

  const setLanguage = (item: (typeof LANGUAGES)[number]) => {
    setLang(item);
    const host = window.location.hostname;
    ["", host, "." + host].forEach((domain) => {
      document.cookie = `googtrans=;path=/;${domain ? `domain=${domain};` : ""}expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    });
    if (item.code !== "en") {
      const value = `/en/${item.code}`;
      document.cookie = `googtrans=${value};path=/`;
      document.cookie = `googtrans=${value};path=/;domain=${host}`;
      document.cookie = `googtrans=${value};path=/;domain=.${host}`;
    }
    window.location.reload();
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover");
  };

  const navItem = ({ label, to, icon: Icon }: NavItem) => {
    const active =
      (label !== "Revenue in Your Apps" && pathname + locationSearch === to) ||
      (to === "/discover" && pathname === "/discover" && !locationSearch) ||
      (to === "/saved-apps" && pathname === "/saved-apps") ||
      (to === "/launch" && pathname === "/launch") ||
      (to === "/create" && pathname === "/create") ||
      (to === "/developer" && pathname.startsWith("/developer"));
    return (
      <Link
        key={label}
        to={to}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${active ? "bg-[#eaf5fc] text-[#075985]" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <style>{`@media(min-width:1024px){*:has(>.marketplace-sidebar)>main,*:has(>.marketplace-sidebar)>footer{margin-left:240px}}`}</style>
      <aside className="marketplace-sidebar fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-[#e8edf2] bg-[#f9fbfd] lg:flex">
        <div className="flex h-17 items-center border-b border-[#e8edf2] px-5">
          <Logo size="md" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
          <div className="mt-3">
            <EcosystemSwitcher compact />
          </div>
          <nav aria-label="Marketplace" className="mt-4 space-y-4">
            {sections.slice(0, 3).map((section) => (
              <div key={section.heading}>
                <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-neutral-500">
                  {section.heading}
                </p>
                <div className="space-y-0.5">{section.items.map(navItem)}</div>
              </div>
            ))}
            <div>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-neutral-500">
                Grow
              </p>
              {[
                ["Launch", "https://trylaunch.ai"],
                ["Post", "https://trypost.ai"],
                ["Media", "https://trymedia.ai"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-9 items-center justify-between rounded-xl px-3 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
                >
                  {label}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
            <div>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-neutral-500">
                Create
              </p>
              {sections[3].items.map(navItem)}
            </div>
          </nav>
        </div>
        <div className="border-t border-[#e8edf2] px-3 py-3">
          <Link
            to={user ? "/settings" : "/login"}
            className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            {user ? (
              <Settings className="h-[18px] w-[18px]" />
            ) : (
              <LogIn className="h-[18px] w-[18px]" />
            )}
            {user ? "Settings" : "Sign in"}
          </Link>
        </div>
      </aside>
      <header className="sticky top-0 z-40 border-b border-[#e8edf2] bg-white/95 backdrop-blur-sm lg:ml-60">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
          <div className="lg:hidden">
            <Logo size="md" />
          </div>
          <form
            onSubmit={submitSearch}
            role="search"
            className="hidden h-10 min-w-0 max-w-lg flex-1 items-center rounded-xl border border-[#e8edf2] bg-[#f7f9fb] px-3 focus-within:border-[#469DDA] sm:flex"
          >
            <Search
              className="mr-2 h-4 w-4 shrink-0 text-neutral-500"
              aria-hidden="true"
            />
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
          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            <Link
              to="/discover"
              aria-label="Search apps"
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 sm:hidden"
            >
              <Search className="h-5 w-5" />
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Choose language"
                className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                <span aria-hidden="true">{lang.flag}</span>
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-80 overflow-y-auto bg-white"
              >
                {LANGUAGES.map((item) => (
                  <DropdownMenuItem
                    key={item.code}
                    onSelect={() => setLanguage(item)}
                    className="gap-2"
                  >
                    {item.code === lang.code ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="w-4" />
                    )}
                    {item.flag} {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeToggle />
            {loading ? (
              <div className="h-8 w-8 rounded-full bg-neutral-100" />
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#469DDA]"
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
                  className="hidden rounded-lg bg-[#469DDA] px-4 py-2.5 text-sm font-semibold text-[#092237] hover:bg-[#80c3ec] sm:block"
                >
                  Sign up
                </Link>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More navigation"
                className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 bg-white">
                <DropdownMenuItem asChild>
                  <Link to="/create">Create branding</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/developer">Rocket Identity pilot</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/your-apps">Revenue in Your Apps</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="https://trylaunch.ai">Launch ↗</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://trypost.ai">Post ↗</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://trymedia.ai">Media ↗</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={user ? "/settings" : "/login"}>
                    {user ? "Account & settings" : "Sign in"}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      {user ? <MobilePrimaryNav /> : <PublicMobileNav />}
    </>
  );
}
