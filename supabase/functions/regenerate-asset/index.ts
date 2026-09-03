import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { cors, geminiText, GeminiUnavailableError, hasGeminiKey } from "../_shared/gemini.ts";
import { generateImage, ImageProviderUnavailableError } from "../_shared/image-generation.ts";
import { GENERATORS, ASSET_TITLES, type AssetType } from "../_shared/generators.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const ch = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: ch });
  let releaseReservation: (() => Promise<void>) | null = null;
  try {
    if (!hasGeminiKey()) return new Response(JSON.stringify({ error: "missing_environment_variable", variable: "GEMINI_API_KEY" }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...ch, "Content-Type": "application/json" } });

    const { asset_id, instruction } = await req.json();
    if (!asset_id) return new Response(JSON.stringify({ error: "asset_id required" }), { status: 400, headers: { ...ch, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: asset } = await admin.from("assets").select("*").eq("id", asset_id).maybeSingle();
    if (!asset) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...ch, "Content-Type": "application/json" } });
    if (asset.user_id !== user.id) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...ch, "Content-Type": "application/json" } });

    const at = asset.asset_type as AssetType;
    const spec = GENERATORS[at] || GENERATORS.other;
    const ctx = (asset.meta?.brand_context) || {};
    const userPrompt = instruction || asset.prompt || `Regenerate this ${ASSET_TITLES[at]}`;

    const cost = spec.kind === "image" ? 10 : 1;
    const { data: reserved, error: reserveError } = await admin.rpc("reserve_generation_credits", { p_user_id: user.id, p_credits: cost });
    if (reserveError) throw reserveError;
    if (!reserved) return new Response(JSON.stringify({ error: "no_credits", code: "no_credits", needed: cost }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
    let reservationOpen = true;
    releaseReservation = async () => {
      if (!reservationOpen) return;
      reservationOpen = false;
      const { error } = await admin.rpc("release_generation_credits", { p_user_id: user.id, p_credits: cost });
      if (error) console.error("credit release failed", error);
    };

    try {
      if (spec.kind === "image") {
        const imgPrompt = await geminiText({ system: spec.system, user: spec.build(ctx, userPrompt), temperature: 0.9 });
        const png = await generateImage(imgPrompt);
        const path = `${user.id}/${Date.now()}-regen.png`;
        await admin.storage.from("rocket-images").upload(path, png, { contentType: "image/png", upsert: false });
        const { data: pub } = admin.storage.from("rocket-images").getPublicUrl(path);
        await admin.from("assets").update({ image_url: pub.publicUrl, thumbnail_url: pub.publicUrl, meta: { ...(asset.meta || {}), image_prompt: imgPrompt } }).eq("id", asset_id);
        reservationOpen = false;
        return new Response(JSON.stringify({ image_url: pub.publicUrl, credits_charged: cost }), { headers: { ...ch, "Content-Type": "application/json" } });
      } else {
        const content = await geminiText({ system: spec.system, user: spec.build(ctx, userPrompt), temperature: 0.8, json: !!spec.json });
        await admin.from("assets").update({ content }).eq("id", asset_id);
        reservationOpen = false;
        return new Response(JSON.stringify({ content, credits_charged: cost }), { headers: { ...ch, "Content-Type": "application/json" } });
      }
    } catch (e) {
      if (e instanceof GeminiUnavailableError || e instanceof ImageProviderUnavailableError) {
        await releaseReservation();
        return new Response(JSON.stringify({ error: "ai_provider_unavailable", message: "Rocket is busy right now. Please try again in a moment." }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
      }
      throw e;
    }
  } catch (e) {
    await releaseReservation?.();
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...ch, "Content-Type": "application/json" } });
  }
});
