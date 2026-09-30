import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import Logo from "./Logo";
import { Button } from "./ui/button";
import {
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Layers3,
  Palette,
  Plus,
  Settings,
  TrendingUp,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

const SiteHeader = () => {
  const [lang, setLang] = useState(LANGUAGES[0]);
  useEffect(() => {
    const m = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i);
    const code = m?.[1];
    if (code) {
      const found = LANGUAGES.find((l) => l.code === code);
      if (found) setLang(found);
    }
  }, []);

  const setLanguage = (l: (typeof LANGUAGES)[number]) => {
    setLang(l);
    const host = window.location.hostname;
    const domains = ["", host, "." + host];
    // Clear existing googtrans cookies
    domains.forEach((d) => {
      document.cookie = `googtrans=;path=/;${d ? `domain=${d};` : ""}expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    });
    if (l.code !== "en") {
      const value = `/en/${l.code}`;
      document.cookie = `googtrans=${value};path=/`;
      document.cookie = `googtrans=${value};path=/;domain=${host}`;
      document.cookie = `googtrans=${value};path=/;domain=.${host}`;
    }
    window.location.reload();
  };
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const avatarUrl = (user?.user_metadata as { avatar_url?: string } | undefined)
    ?.avatar_url;
  const initial = (user?.email?.[0] || "U").toUpperCase();
  return (
    <>
      <header
        className="sticky top-0 z-50 bg-white"
        style={user ? { borderBottom: "1px solid #e5e7eb" } : undefined}
      >
        <div className="relative mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <div className="flex h-full items-center">
            <Logo size="md" />
          </div>
          {user ? (
            <div className="mx-auto" />
          ) : (
            <nav
              aria-label="Primary"
              className="mx-auto hidden items-center gap-2 lg:flex"
            >
              <Link
                to="/discover"
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                Discover
              </Link>
              <Link
                to="/launch"
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                Launch an app
              </Link>
              <Link
                to="/your-apps"
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                For developers
              </Link>
              <Link
                to="/create"
                className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
              >
                Create branding
              </Link>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-6">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-neutral-600 hover:text-neutral-900 focus:outline-hidden">
                <span className="text-base leading-none">{lang.flag}</span>
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="max-h-80 overflow-y-auto bg-white text-neutral-900 border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{ colorScheme: "light" }}
              >
                {LANGUAGES.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onSelect={() => setLanguage(l)}
                    className="gap-2 text-neutral-900 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    {l.code === lang.code ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="text-base leading-none">{l.flag}</span>
                    <span>{l.label}</span>
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
                  className="rounded-full outline-hidden focus:ring-2 focus:ring-neutral-300"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8 border border-neutral-200">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                    <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-700">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
                >
                  <div className="px-2 py-1.5">
                    <p className="text-xs text-neutral-500">Signed in as</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-neutral-900">
                      {user?.email}
                    </p>
                  </div>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    <Link
                      to="/pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Plans
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    <Link to="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    <Link to="/settings/billing">Billing & credits</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    <a href="mailto:alex@tryrocket.ai">Help</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      await signOut();
                      nav("/");
                    }}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden text-sm font-medium text-neutral-600 hover:text-neutral-900 sm:inline"
                >
                  Login
                </Link>
                <Button asChild size="lg" className="h-12 px-6 text-sm">
                  <Link to="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      {user && (
        <>
          <style>{`@media(min-width:1024px){.marketplace-page:has(.marketplace-sidebar)>main,.marketplace-page:has(.marketplace-sidebar)>footer{margin-left:240px}}`}</style>
          <aside className="marketplace-sidebar fixed bottom-0 left-0 top-16 z-40 hidden w-60 flex-col overflow-y-auto border-r border-neutral-200 bg-[#fcfdff] p-4 lg:flex">
            <EcosystemSwitcher />
            <nav aria-label="Marketplace" className="mt-6 space-y-5">
              {[
                {
                  heading: "Discover",
                  items: [
                    ["Discover", "/discover", Compass],
                    ["Rising", "/discover?view=rising", TrendingUp],
                    ["Categories", "/discover?view=categories", Layers3],
                    ["Saved Apps", "/saved-apps", Bookmark],
                  ],
                },
                {
                  heading: "Your apps",
                  items: [
                    ["Your Apps", "/your-apps", Layers3],
                    ["Launch an app", "/launch", Plus],
                  ],
                },
                {
                  heading: "Create",
                  items: [
                    ["Brand Studio", "/create", Palette],
                    ["Saved Designs", "/saved", Bookmark],
                  ],
                },
              ].map((section) => (
                <div key={section.heading}>
                  <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-neutral-400">
                    {section.heading}
                  </p>
                  {section.items.map(([label, to, Icon]) => (
                    <Link
                      key={label as string}
                      to={to as string}
                      className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${pathname === to || pathname + search === to ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {label as string}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="border-t border-neutral-200 pt-4">
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-neutral-400">
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
                    className="flex h-9 items-center justify-between rounded-xl px-3 text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    {label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            </nav>
            <Link
              to="/settings"
              className="mt-auto flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              <Settings className="h-[18px] w-[18px]" />
              Settings
            </Link>
          </aside>
        </>
      )}
      {user ? <MobilePrimaryNav /> : <PublicMobileNav />}
    </>
  );
};

export default SiteHeader;
