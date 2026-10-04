import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { EditorRoute } from "./editor";

describe("Brand Studio route loading", () => {
  it("renders an SSR-safe loading shell without evaluating the canvas editor", () => {
    const html = renderToString(<EditorRoute />);
    expect(html).toContain("Loading Brand Studio");
    expect(html).not.toContain("canvas");
  });

  it("can evaluate the real editor and canvas dependency with the installed React", async () => {
    const editor = await import("@/pages/Editor");
    expect(typeof editor.default).toBe("function");
    const canvas = await import("react-konva");
    expect(canvas.Stage).toBeTruthy();
  });
});
