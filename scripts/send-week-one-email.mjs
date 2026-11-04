import { pathToFileURL } from "node:url";

const endpoint = "https://lcujmvdgczkjxdstzhnr.supabase.co/rest/v1/rpc/queue_week_one_emails";

export async function run({ key, dryRun = true, fetchImpl = fetch }) {
  if (!key) throw new Error("ROCKET_SUPABASE_SERVICE_ROLE_KEY is required");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_dry_run: dryRun }),
  });
  if (!response.ok) throw new Error(`Week-one queue RPC failed (${response.status})`);
  const count = await response.json();
  if (!Number.isInteger(count) || count < 0) throw new Error("Unexpected week-one queue response");
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.env.WEEK_ONE_DRY_RUN !== "false";
  run({ key: process.env.ROCKET_SUPABASE_SERVICE_ROLE_KEY, dryRun })
    .then((count) => console.log(`${dryRun ? "Eligible" : "Queued"} week-one emails: ${count}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
