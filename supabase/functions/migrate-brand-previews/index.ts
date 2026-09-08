import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const url = Deno.env.get("SUPABASE_URL")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "https://tryrocket.ai", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const isData = (value: unknown): value is string => typeof value === "string" && /^data:image\/[\w.+-]+;base64,/.test(value);
async function store(admin: any, value: string, userId: string, projectId: string, recordId: string, field: string) {
  const [, mime, body] = value.match(/^data:(image\/[\w.+-]+);base64,(.*)$/) || [];
  if (!mime || !body) throw new Error("Invalid image data URL");
  const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";
  const path = `brand-previews/${userId}/${projectId}/${recordId}-${field}.${ext}`;
  const { error } = await admin.storage.from("rocket-images").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  return admin.storage.from("rocket-images").getPublicUrl(path).data.publicUrl;
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await client.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  const admin = createClient(url, service);
  const { data: projects } = await admin.from("projects").select("id,cover_url").eq("user_id", user.id).is("deleted_at", null);
  let migrated = 0, failed = 0;
  for (const project of projects || []) {
    const { data: assets } = await admin.from("assets").select("id,thumbnail_url,image_url,meta").eq("project_id", project.id).eq("user_id", user.id).is("deleted_at", null);
    // The first deployment inspected one arbitrary asset per project. A Brand
    // Kit's canonical artwork is the asset explicitly saved into that kit, so
    // process every such asset on a re-run. Existing backup rows make this
    // idempotent: already-migrated URLs are skipped.
    const savedAssets = (assets || []).filter((asset: any) => Boolean(asset?.meta?.saved_at));
    for (const [field, value, id] of [["cover_url", project.cover_url, project.id], ...(savedAssets.flatMap((a: any) => [["thumbnail_url",a.thumbnail_url,a.id],["image_url",a.image_url,a.id]]))] as any[]) {
      if (!isData(value)) continue;
      try { const migratedUrl = await store(admin,value,user.id,project.id,id,field);
        await admin.from("legacy_brand_preview_backups").upsert({user_id:user.id,project_id:project.id,asset_id:field === "cover_url" ? null : id,field_name:field,original_value:value,migrated_url:migratedUrl,migrated_at:new Date().toISOString()},{onConflict:field === "cover_url" ? "project_id,field_name" : "asset_id,field_name"});
        await admin.from(field === "cover_url" ? "projects" : "assets").update({[field]:migratedUrl}).eq("id",id); migrated++;
      } catch { failed++; }
    }
  }
  return new Response(JSON.stringify({ migrated, failed }), { headers: { ...cors, "Content-Type":"application/json" } });
});
