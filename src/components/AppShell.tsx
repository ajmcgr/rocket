import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Outlet } from "@/lib/router-compat";
import SiteHeader from "./SiteHeader";
import OnboardingTour from "./OnboardingTour";
import CommandPalette from "./CommandPalette";

export type AppShellOutletContext = {
  setHeaderLeft: (node: ReactNode | null) => void;
  setHeaderCenter: (node: ReactNode | null) => void;
  setHeaderActions: (node: ReactNode | null) => void;
};

// Keep editor controls in context while all routes share the site chrome.
const AppShellContext = createContext<AppShellOutletContext | null>(null);

export function useAppShell(): AppShellOutletContext {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell must be used within AppShell");
  return ctx;
}

export default function AppShell() {
  const [headerLeft, setHeaderLeft] = useState<ReactNode | null>(null);
  const [headerCenter, setHeaderCenter] = useState<ReactNode | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const context = useMemo(
    () => ({ setHeaderLeft, setHeaderCenter, setHeaderActions }),
    [],
  );

  return (
    <AppShellContext.Provider value={context}>
      <div className="app-shell min-h-screen bg-[#f5f7fb] pb-20 font-body text-neutral-900 lg:pb-0">
        <SiteHeader
          headerLeft={headerLeft}
          headerCenter={headerCenter}
          headerActions={headerActions}
        />
        <OnboardingTour />
        <CommandPalette />
        <main className="transition-[margin-left] duration-200">
          <Outlet />
        </main>
      </div>
    </AppShellContext.Provider>
  );
}
