import { supabase } from "@/integrations/supabase/client";
import type { MyApp } from "@/components/AppJourney";

export async function loadMyApps(): Promise<MyApp[]> {
  const { data, error } = await supabase.functions.invoke("rocket-apps", {
    body: { action: "my_apps" },
  });
  if (error || !Array.isArray(data))
    throw error || new Error("My Apps unavailable");

  const ids = data.filter((item) => item.app).map((item) => item.app_id);
  const { data: publicApps } = ids.length
    ? await supabase.from("public_apps").select("id,slug").in("id", ids)
    : { data: [] };
  const slugs = new Map((publicApps || []).map((app) => [app.id, app.slug]));
  const unique = data.filter(
    (item, index, items) =>
      items.findIndex((entry) => entry.app_id === item.app_id) === index,
  );
  return unique.map((item) => ({
    ...item,
    app: item.app
      ? { ...item.app, slug: slugs.get(item.app_id) || item.app.slug }
      : null,
  }));
}

export function myAppStatus(item: MyApp): string {
  if (item.owned)
    return item.owner_verification_level === "domain_verified"
      ? "Domain verified"
      : "Claimed";
  if (item.status === "review") return "Review pending";
  if (item.status === "rejected") return "Not approved";
  return "Claim pending";
}
