import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type ThemePreference = "system" | "light" | "dark";

const readPreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
};

const applyPreference = (preference: ThemePreference) => {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", preference === "dark" || (preference === "system" && systemDark));
};

/**
 * Theme selector. System mode follows OS changes; the pre-hydration script in
 * __root.tsx applies the saved preference before first paint.
 */
const ThemeToggle = () => {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const saved = readPreference();
    setPreference(saved);
    applyPreference(saved);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const onSystemChange = () => {
      setSystemDark(media.matches);
      if (readPreference() === "system") applyPreference("system");
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== "theme") return;
      const next = readPreference();
      setPreference(next);
      applyPreference(next);
    };
    const onLocalChange = () => setPreference(readPreference());
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorageChange);
    window.addEventListener("rocket-theme-change", onLocalChange);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener("rocket-theme-change", onLocalChange);
    };
  }, []);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable — session-only */
    }
    applyPreference(next);
    window.dispatchEvent(new Event("rocket-theme-change"));
  };
  const CurrentIcon = preference === "dark" || (preference === "system" && systemDark) ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${preference}. Choose appearance`}
        title={`Appearance: ${preference}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-[#167ac6] dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        <CurrentIcon className="h-[19px] w-[19px] stroke-[1.8]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-40 rounded-xl border border-neutral-200 bg-white p-1.5 text-neutral-800 shadow-[0_10px_28px_rgba(0,0,0,0.16)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
        {(["light", "dark", "system"] as const).map((option) => (
          <DropdownMenuItem key={option} onSelect={() => choose(option)} aria-current={preference === option ? "true" : undefined} className={`min-h-10 gap-3 rounded-lg px-2.5 text-sm font-normal text-neutral-800 focus:bg-neutral-100 dark:text-neutral-100 dark:focus:bg-neutral-800 ${preference === option ? "bg-neutral-200" : ""}`}>
            {option === "light" ? <Sun className="h-4 w-4 stroke-[1.8]" aria-hidden="true" /> : option === "dark" ? <Moon className="h-4 w-4 stroke-[1.8]" aria-hidden="true" /> : <Monitor className="h-4 w-4 stroke-[1.8]" aria-hidden="true" />}
            <span className="capitalize">{option}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
