import { describe, expect, it } from "vitest";
import {
  buyStatus,
  idStatus,
  integrationPrompt,
  developerMessage,
  type DeveloperClient,
} from "./developerExperience";

const client: DeveloperClient = {
  app_id: "owned-app",
  client_id: "public-client",
  name: "My app",
  environment: "production",
  is_active: true,
  redirect_uris: ["https://example.com/auth/rocket"],
};
describe("Developer readiness", () => {
  it("uses actual ID environment and enabled state", () => {
    expect(idStatus()).toBe("Not set up");
    expect(idStatus(client)).toBe("Live");
    expect(idStatus({ ...client, environment: "test" })).toBe("Testing");
    expect(idStatus({ ...client, is_active: false })).toBe("Action needed");
  });
  it("does not mark buying live from membership, merchant, or price alone", () => {
    expect(buyStatus()).toBe("Not set up");
    expect(buyStatus(null, true)).toBe("Action needed");
    const state = {
      merchant: null,
      products: [],
      platform_fee_bps: 725,
      launch_ready: false,
    };
    expect(buyStatus(state)).toBe("Stripe setup");
    const merchant = { ready: true, status: "active" };
    expect(buyStatus({ ...state, merchant })).toBe("Plan required");
    const products = [
      { is_active: true, activated_at: "now", integration_confirmed_at: "now" },
    ];
    expect(buyStatus({ ...state, merchant, products })).toBe("Testing");
    expect(
      buyStatus({ ...state, merchant, products, launch_ready: true }),
    ).toBe("Live");
    expect(
      buyStatus({
        ...state,
        merchant,
        products: [{ is_active: true }],
        launch_ready: true,
      }),
    ).toBe("Testing");
  });
});
describe("Safe app-specific integration prompt", () => {
  it("includes only registered product facts and replay-safe one-time semantics", () => {
    const prompt = integrationPrompt(client, "owned-app", [{ id: "real-product", product_key: "real-key", name: "Actual product", amount_cents: 3900, currency: "usd", billing_type: "one_time", interval: null, is_active: false, secret_key: "NEVER_COPY" } as any])!;
    expect(prompt).toContain("real-key"); expect(prompt).toContain('"amount_cents":3900'); expect(prompt).toContain('"billing_type":"one_time"'); expect(prompt).toContain('"enabled":false'); expect(prompt).toContain("purchase_id"); expect(prompt).toContain("Do not activate inactive products"); expect(prompt).not.toContain("NEVER_COPY");
    expect(integrationPrompt(client, "owned-app")!).toContain("Do not invent a plan or enable payments.");
  });
  it("selects public fields only and instructs fail-closed identity and access checks", () => {
    const prompt = integrationPrompt(
      {
        ...client,
        stripe_secret: "NEVER_COPY",
        access_token: "NEVER_COPY",
      } as DeveloperClient,
      "owned-app",
    )!;
    expect(prompt).toContain(client.client_id);
    expect(prompt).toContain(client.redirect_uris[0]);
    expect(prompt).toContain("Preserve its current authentication");
    expect(prompt).toContain("fail closed");
    expect(prompt).toContain("connect-entitlements");
    expect(prompt).toContain("Existing prices can be imported as inactive plans");
    expect(prompt).toContain("Rocket currently supports only one active offer per app");
    expect(prompt).toContain("Never grant access from a checkout return URL");
    expect(prompt).not.toContain("NEVER_COPY");
  });
  it("does not generate prompts for wrong app, test, disabled, or unsafe callbacks", () => {
    expect(integrationPrompt(client, "another-app")).toBeNull();
    expect(
      integrationPrompt({ ...client, environment: "test" }, "owned-app"),
    ).toBeNull();
    expect(
      integrationPrompt({ ...client, is_active: false }, "owned-app"),
    ).toBeNull();
    for (const callback of [
      "http://example.com",
      "https://example.com/#token",
      "https://user:password@example.com",
      "https://*.example.com",
      "not-a-url",
    ])
      expect(
        integrationPrompt(
          { ...client, redirect_uris: [callback] },
          "owned-app",
        ),
      ).toBeNull();
  });
  it("keeps technical failures out of the primary error UI", () => {
    expect(developerMessage("production_rocket_id_required")).toContain(
      "Set up Rocket ID",
    );
    expect(developerMessage("arbitrary_private_error")).not.toContain(
      "arbitrary_private_error",
    );
  });
});
