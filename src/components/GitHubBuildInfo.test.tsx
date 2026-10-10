import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import GitHubBuildInfo from "./GitHubBuildInfo";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

afterEach(() => {
  invoke.mockReset();
  vi.unstubAllGlobals();
});

async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onAddSource = vi.fn();
  await act(async () => {
    root.render(
      <GitHubBuildInfo appId="app-1" refresh={0} onAddSource={onAddSource} />,
    );
  });
  return {
    container,
    onAddSource,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("GitHub build information", () => {
  it("shows the latest public Actions run and exact repository link", async () => {
    invoke.mockResolvedValue({
      data: {
        connected: true,
        repository: "acme/widget",
        repository_url: "https://github.com/acme/widget",
        run: {
          name: "CI",
          status: "completed",
          conclusion: "success",
          branch: "main",
          sha: "a".repeat(40),
          updated_at: "2026-10-10T00:00:00Z",
          url: "https://github.com/acme/widget/actions/runs/123",
        },
      },
      error: null,
    });
    const { container, cleanup } = await render();
    try {
      expect(invoke).toHaveBeenCalledWith("rocket-apps", {
        body: { action: "github_build_info", app_id: "app-1" },
      });
      expect(container.textContent).toContain("Passed");
      expect(container.textContent).toContain("CI");
      expect(
        container.querySelector(
          'a[href="https://github.com/acme/widget/actions/runs/123"]',
        ),
      ).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("offers source linking when no repository is connected", async () => {
    invoke.mockResolvedValue({ data: { connected: false }, error: null });
    const { container, onAddSource, cleanup } = await render();
    try {
      expect(container.textContent).toContain(
        "No public GitHub repository is linked",
      );
      await act(async () => {
        (
          Array.from(container.querySelectorAll("button")).find((button) =>
            button.textContent?.includes("Add public GitHub"),
          ) as HTMLButtonElement
        ).click();
      });
      expect(onAddSource).toHaveBeenCalledOnce();
    } finally {
      await cleanup();
    }
  });
});
