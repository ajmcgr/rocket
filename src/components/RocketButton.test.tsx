import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RocketButton from "./RocketButton";
import "../../public/buttons/v1/rocket-buttons.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
describe("official Rocket button", () => {
  it("keeps branding fixed and blocks loading/disabled activation in both integrations", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container),
      activate = vi.fn();
    const render = async (loading = false, disabled = false) =>
      act(async () =>
        root.render(
          <RocketButton
            action="buy"
            onActivate={activate}
            loading={loading}
            disabled={disabled}
          />,
        ),
      );
    try {
      await render();
      const host = container.querySelector("rocket-button")!,
        button = host.shadowRoot!.querySelector("button")!;
      expect(button.type).toBe("button");
      expect(button.getAttribute("aria-label")).toBe("Buy with Rocket");
      await act(async () => button.click());
      expect(activate).toHaveBeenCalledTimes(1);
      await render(true);
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(host.shadowRoot!.querySelector(".label")!.textContent).toBe(
        "Buy with Rocket",
      );
      expect(
        host.shadowRoot!.querySelector('[role="status"]')!.textContent,
      ).toBe("Opening checkout…");
      button.click();
      expect(activate).toHaveBeenCalledTimes(1);
      await render(false, true);
      button.click();
      expect(activate).toHaveBeenCalledTimes(1);
      await render();
      await act(async () => button.click());
      expect(activate).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
    }
  });
  it("external HTML uses the same fixed labels, mark and approved variants without handling flows", () => {
    const host = document.createElement("rocket-button");
    document.body.append(host);
    host.textContent = "Fake brand";
    host.setAttribute("label", "Fake brand");
    host.setAttribute("icon", "fake.svg");
    host.setAttribute("action", "continue");
    host.setAttribute("variant", "dark");
    const button = host.shadowRoot!.querySelector("button")!;
    expect(button.className).toBe("dark");
    expect(button.textContent).toBe("Continue with Rocket");
    expect(
      host.shadowRoot!.querySelector(".mark")!.getAttribute("aria-hidden"),
    ).toBe("true");
    const activate = vi.fn();
    host.addEventListener("rocket-activate", activate);
    button.click();
    expect(activate).toHaveBeenCalledTimes(1);
    host.setAttribute("variant", "light");
    expect(button.className).toBe("light");
    host.setAttribute("variant", "hot-pink");
    expect(button.className).toBe("primary");
    host.setAttribute("action", "renamed");
    expect(button.textContent).toBe("Continue with Rocket");
    host.setAttribute("disabled", "");
    button.click();
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
