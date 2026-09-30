import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark mode toggle. Dark mode is a class on <html> (see the dark mode
 * layer at the bottom of src/styles.css); the pre-hydration script in
 * __root.tsx re-applies the stored preference before first paint.
 */
const ThemeToggle = () => {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable — session-only */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-full p-2 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus:outline-hidden"
    >
      {dark ? (
        <Sun className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );
};

export default ThemeToggle;
