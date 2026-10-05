import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const rules = css.match(/(?:html\.dark )?\.app-shell-sidebar\s*\{[^}]*\}/g) || [];

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("sidebar resolved theme", () => {
  it("has a theme-aware sidebar surface instead of a hardcoded utility", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain('className="app-shell-sidebar ');
    expect(shell).not.toContain("bg-[#fcfdff]");
    expect(rules).toHaveLength(2);
  });
  it("keeps the pale surface in light mode and switches when System resolves dark", () => {
    const style = document.createElement("style");
    style.textContent = rules.join("\n");
    document.head.append(style);
    const sidebar = document.createElement("aside");
    sidebar.className = "app-shell-sidebar";
    document.body.append(sidebar);
    expect(getComputedStyle(sidebar).backgroundColor).toBe("rgb(252, 253, 255)");
    // ThemeToggle resolves both System-dark and explicit Dark to this class.
    document.documentElement.classList.add("dark");
    expect(getComputedStyle(sidebar).backgroundColor).not.toBe("rgb(252, 253, 255)");
    expect(getComputedStyle(sidebar).backgroundColor).not.toBe("transparent");
    document.documentElement.classList.remove("dark");
    expect(getComputedStyle(sidebar).backgroundColor).toBe("rgb(252, 253, 255)");
  });
});
