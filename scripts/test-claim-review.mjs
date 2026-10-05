// In-memory real PostgreSQL (PGlite). No network, production claims or email.
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
let sql = read("scripts/test-claim-review.sql").replace(
  "\\set ON_ERROR_STOP on",
  "",
);
// pgcrypto isn't shipped in PGlite: emulate only random bytes for this fixture.
sql = sql.replace(
  "create extension pgcrypto with schema extensions;",
  () =>
    `create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(md5(random()::text)||md5(random()::text),'hex')$$;`,
);
sql = sql.replace(
  "\\ir ../supabase/migrations/20261005035744_manual_claim_review_delivery.sql",
  () =>
    read("supabase/migrations/20261005035744_manual_claim_review_delivery.sql"),
);
const original = read("supabase/migrations/20261001120000_rocket_admin_os.sql");
const action = original.slice(
  original.indexOf("create function public.rocket_admin_action("),
);
sql = sql.replace("\\ir test-claim-admin-action.sql", () => action);
try {
  await db.exec(sql);
  console.log(
    "PASS: PostgreSQL migration and claim lifecycle/security assertions",
  );
} catch (error) {
  console.error(error.message, error.detail || "", error.where || "");
  process.exitCode = 1;
} finally {
  await db.close();
}
