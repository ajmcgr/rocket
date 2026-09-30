import { useEffect, useState } from "react";
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

  useEffect(() => {
    const saved = readPreference();
    setPreference(saved);
    applyPreference(saved);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${preference}. Choose appearance`}
        title={`Appearance: ${preference}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus:outline-hidden"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center text-[22px] leading-none" aria-hidden="true">
          {preference === "system" ? "🖥️" : preference === "dark" ? "🌙" : "☀️"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36 bg-white">
        {(["system", "light", "dark"] as const).map((option) => (
          <DropdownMenuItem key={option} onSelect={() => choose(option)} aria-current={preference === option ? "true" : undefined}>
            <span className="mr-2" aria-hidden="true">{option === "system" ? "🖥️" : option === "light" ? "☀️" : "🌙"}</span>
            <span className="capitalize">{option}</span>
            {preference === option && <span className="ml-auto" aria-hidden="true">✅</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
