// A separately runnable app for Phase 3. It deliberately refuses to start
// without an app ID created through the Rocket developer portal, so it cannot
// accidentally reuse the Phase 1/2 manually-provisioned proof client.
if (!process.env.ROCKET_CLIENT_ID || !process.env.ROCKET_PRODUCT_KEY) {
  throw new Error("Set ROCKET_CLIENT_ID and ROCKET_PRODUCT_KEY from your Rocket Developer app before starting this external test client.");
}
if (!process.env.ROCKET_REDIRECT_URI) process.env.ROCKET_REDIRECT_URI = `http://127.0.0.1:${process.env.PORT || 3002}/callback`;
await import("../rocket-connect-test-client/server.mjs");
