import { Link, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { Button } from "./ui/button";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  const setLanguage = (l: typeof LANGUAGES[number]) => {
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
  const avatarUrl = (user as any)?.user_metadata?.avatar_url as string | undefined;
  const initial = (user?.email?.[0] || "U").toUpperCase();
  return (
    <header
      className="sticky top-0 z-50 bg-white"
      style={user ? { borderBottom: "1px solid #e5e7eb" } : undefined}
    >
      <div className="relative mx-auto flex h-16 max-w-4xl items-center px-6">
        <div className="flex h-full items-center">
          <Logo size="md" />
        </div>
        <nav className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-7 text-sm font-medium leading-none text-neutral-600 md:flex">
          {user ? (
            <>
              <Link to="/logos" className="hover:text-neutral-900">Create</Link>
              <Link to="/logos" className="hover:text-neutral-900">Logos</Link>
              <Link to="/icons" className="hover:text-neutral-900">Icons</Link>
              <Link to="/brands" className="hover:text-neutral-900">Brand Kits</Link>
              <Link to="/templates" className="hover:text-neutral-900">Templates</Link>
            </>
          ) : (
            <>
              <Link to="/pricing" className="hover:text-neutral-900">Pricing</Link>
              <Link to="/faq" className="hover:text-neutral-900">FAQ</Link>
              <Link to="/blog" className="hover:text-neutral-900">Resources</Link>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-neutral-600 hover:text-neutral-900 focus:outline-none">
              <span className="text-base leading-none">{lang.flag}</span>
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto bg-white text-neutral-900 border-neutral-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ colorScheme: "light" }}>
              {LANGUAGES.map((l) => (
                <DropdownMenuItem key={l.code} onSelect={() => setLanguage(l)} className="gap-2 text-neutral-900 focus:bg-neutral-100 focus:text-neutral-900">
                  {l.code === lang.code ? <Check className="h-4 w-4" /> : <span className="w-4" />}
                  <span className="text-base leading-none">{l.flag}</span>
                  <span>{l.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {loading ? (
            <div className="h-8 w-8 rounded-full bg-neutral-100" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full outline-none focus:ring-2 focus:ring-neutral-300" aria-label="Account menu">
                <Avatar className="h-8 w-8 border border-neutral-200">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                  <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-700">{initial}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
                <div className="px-2 py-1.5">
                  <p className="text-xs text-neutral-500">Signed in as</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-neutral-900">{user?.email}</p>
                </div>
                <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
                  <Link to="/pricing" target="_blank" rel="noopener noreferrer">Plans</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => { await signOut(); nav("/"); }}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/login" className="hidden text-sm font-medium text-neutral-600 hover:text-neutral-900 sm:inline">Login</Link>
              <Button asChild size="lg" className="h-12 px-6 text-sm">
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;
