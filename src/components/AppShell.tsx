import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Logo from "./Logo";
import ShareExportModal from "./ShareExportModal";
import OnboardingTour from "./OnboardingTour";
import NotificationsBell from "./NotificationsBell";
import CommandPalette from "./CommandPalette";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import BuyCreditsMenu from "./BuyCreditsMenu";
import {
  HelpCircle,
  Compass,
  Palette,
  PenTool,
  Settings,
  Share2,
  Sparkles,
  Shapes,
  LayoutTemplate,
  Star,
  Wand2,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppShellOutletContext = {
  setHeaderLeft: (node: ReactNode | null) => void;
  setHeaderCenter: (node: ReactNode | null) => void;
  setHeaderActions: (node: ReactNode | null) => void;
};

type StudioNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  tour?: string;
};

const studioNav: StudioNavItem[] = [
  { label: "Logo Designer", to: "/logos", icon: Sparkles, tour: "nav-logos" },
  { label: "Icon Designer", to: "/icons", icon: Shapes, tour: "nav-icons" },
  { label: "Wizard", to: "/wizard", icon: Wand2, tour: "nav-wizard" },
  { label: "Templates", to: "/templates", icon: LayoutTemplate, tour: "nav-templates" },
  { label: "Saved", to: "/saved", icon: Star, tour: "nav-saved" },
  { label: "Brand Kit", to: "/brands", icon: Palette, tour: "nav-brand" },
  { label: "Editor", to: "/editor", icon: PenTool, tour: "nav-editor" },
  { label: "Trash", to: "/trash", icon: Trash2, tour: "nav-trash" },
];

const AppShell = () => {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const initial = (user?.email?.[0] || "U").toUpperCase();
  const avatarUrl = (user as any)?.user_metadata?.avatar_url as string | undefined;
  const [shareOpen, setShareOpen] = useState(false);
  const [headerLeft, setHeaderLeft] = useState<ReactNode | null>(null);
  const [headerCenter, setHeaderCenter] = useState<ReactNode | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("rocket:sidebar-collapsed");
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("rocket:sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  const sidebarItemClass = ({ isActive }: { isActive: boolean }) =>
    `group flex h-10 w-full items-center gap-3 rounded-xl font-body text-sm font-medium transition ${collapsed ? "justify-center px-0" : "px-3"} ${isActive
      ? "bg-neutral-900 text-white shadow-sm"
      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950"}`;


  const sidebarWidth = collapsed ? 68 : 220;

  return (
    <div className="app-shell min-h-screen bg-[#f5f7fb] font-body text-neutral-900">
      <header className="sticky top-0 z-50 bg-white" style={{ boxShadow: "inset 0 -1px 0 #d4d4d8" }}>
        <div className="relative flex h-14 w-full items-center px-4 sm:px-5">
          <Logo to="/logos" size="md" className="shrink-0" />
          {headerLeft && <div className="ml-2 flex shrink-0 items-center gap-2">{headerLeft}</div>}
          <div className="ml-4 hidden items-center gap-1 md:flex lg:hidden">
            {studioNav.slice(0, 3).map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) => `rounded-lg px-2.5 py-2 text-sm font-medium transition ${isActive ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center justify-center md:flex">
            <div
              className="pointer-events-auto max-w-full px-4"
              style={{ width: "min(28rem, calc(100vw - 52rem))" }}
            >
              {headerCenter}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {headerActions}
            <WorkspaceSwitcher />
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 md:inline-flex"
              aria-label="Share Rocket"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <div data-tour="nav-notifications" className="inline-flex">
              <NotificationsBell />
            </div>
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
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900">
                  <Link to="/pricing" target="_blank" rel="noopener noreferrer">Plans</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => { await signOut(); nav("/"); }}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-neutral-700 focus:bg-neutral-100 focus:text-neutral-900"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <aside
        className="fixed bottom-0 left-0 top-14 z-40 hidden flex-col border-r border-neutral-200 bg-white py-3 px-3 font-body lg:flex transition-[width] duration-200"
        style={{ width: sidebarWidth }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`mb-3 flex h-9 w-full items-center gap-2 rounded-xl font-body text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900 ${collapsed ? "justify-center px-0" : "px-3"}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>

        <nav className="flex flex-col gap-1" aria-label="Rocket studio">
          <NavLink to="/discover" className={sidebarItemClass} aria-label="Discover" title="Discover">
            <Compass className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Discover</span>}
          </NavLink>
          {studioNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                data-tour={item.tour}
                className={sidebarItemClass}
                aria-label={item.label}
                title={item.label}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          <BuyCreditsMenu collapsed={collapsed} />
          <NavLink
            to="/settings/profile"
            className={sidebarItemClass}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
            {!collapsed && <span className="truncate">Settings</span>}
          </NavLink>
          <a
            href="mailto:alex@tryrocket.ai"
            className={`flex h-10 w-full items-center gap-3 rounded-xl font-body text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950 ${collapsed ? "justify-center px-0" : "px-3"}`}
            aria-label="Email support"
            title="Email support"
          >
            <HelpCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
            {!collapsed && <span className="truncate">Help</span>}
          </a>

        </div>
      </aside>
      <div className="min-h-screen transition-[padding] duration-200" style={{ paddingLeft: `var(--rocket-sidebar, 0px)` }}>
        <style>{`@media (min-width: 1024px){.app-shell{--rocket-sidebar:${sidebarWidth}px}}`}</style>
      <OnboardingTour />
      <CommandPalette />
      <ShareExportModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        asset={{ id: "site", title: "Rocket — AI brand & content studio" } as any}
        onCreateShareLink={async () => (typeof window !== "undefined" ? window.location.origin : "https://tryrocket.ai")}
      />
      <main className="w-full">
        <Outlet context={{ setHeaderLeft, setHeaderCenter, setHeaderActions }} />
      </main>
      </div>
    </div>
  );
};

export default AppShell;
