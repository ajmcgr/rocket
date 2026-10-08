import { APP_URL, issuer, json } from "../_shared/rocketConnect.ts";

Deno.serve(() =>
  json(
    {
      issuer: issuer(),
      authorization_endpoint: `${APP_URL}/connect/authorize`,
      token_endpoint: `${Deno.env.get("SUPABASE_URL")}/functions/v1/rocket-connect-token`,
      userinfo_endpoint: `${Deno.env.get("SUPABASE_URL")}/functions/v1/rocket-connect-userinfo`,
      jwks_uri: `${Deno.env.get("SUPABASE_URL")}/functions/v1/rocket-connect-jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["openid", "profile", "email", "entitlements:read"],
      code_challenge_methods_supported: ["S256"],
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  ),
);
