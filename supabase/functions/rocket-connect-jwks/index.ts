import { json, publicJwk } from "../_shared/rocketConnect.ts";

Deno.serve(() => {
  try { return json({ keys: [publicJwk()] }, 200, { "Cache-Control": "public, max-age=3600" }); }
  catch { return json({ error: "temporarily_unavailable" }, 503); }
});
