import { supabase as _sb } from "@/integrations/supabase/client";
import { ensureActiveWorkspaceId } from "@/lib/workspace";
import { sendBrandKitEmail } from "@/lib/kitEmails";

const supabase = _sb as any;

export type BrandableAsset = {
  id: string;
  title?: string | null;
  project_id?: string | null;
  user_id?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  meta?: any;
};

export const assetCoverUrl = (asset: BrandableAsset) => {
  const meta = asset?.meta || {};
  const candidates = [asset.image_url, asset.thumbnail_url, meta.image_url, meta.thumbnail_url, meta.cover_url];
  return candidates.find((value) => typeof value === "string" && value.trim() && !value.startsWith("data:image/")) || null;
};

/** Persist the asset that represents a kit at the same time its brand direction is chosen. */
export async function setBrandKitCover(projectId: string, asset: BrandableAsset): Promise<string | null> {
  const cover_url = assetCoverUrl(asset);
  if (!cover_url) return null;
  const { error } = await supabase.from("projects").update({ cover_url }).eq("id", projectId);
  if (error) throw error;
  return cover_url;
}

const isMissingColumnError = (error: any, column: string) => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes(column.toLowerCase()) && (
    message.includes("column")
    || message.includes("schema cache")
    || message.includes("could not find")
  );
};

/** Attach an asset to an existing brand kit (project). Returns projectId. */
export async function addAssetToBrand(assetId: string, projectId: string): Promise<string> {
  const { data: project } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = project?.workspace_id || await ensureActiveWorkspaceId();
  if (workspaceId && !project?.workspace_id) {
    await supabase.from("projects").update({ workspace_id: workspaceId }).eq("id", projectId);
  }

  // Fetch existing meta so we merge, not overwrite. Every Brand Kit page
  // (Logo/Icon Files, Social Icons, Brand Book, Downloads) filters by
  // `meta.saved_at` — without stamping it here, an asset attached to a brand
  // kit is invisible to the downstream pipeline.
  const { data: existing } = await supabase
    .from("assets")
    .select("meta")
    .eq("id", assetId)
    .maybeSingle();
  const meta = {
    ...(existing?.meta || {}),
    saved_at: existing?.meta?.saved_at || new Date().toISOString(),
  };

  const patch: any = { project_id: projectId, meta };
  if (workspaceId) patch.workspace_id = workspaceId;

  let { error } = await supabase.from("assets").update(patch).eq("id", assetId);
  if (error && isMissingColumnError(error, "workspace_id")) {
    const retry = await supabase
      .from("assets")
      .update({ project_id: projectId, meta })
      .eq("id", assetId);
    error = retry.error;
  }
  if (error) throw error;
  return projectId;
}

/**
 * Create a new brand kit from a saved asset:
 * 1) Create a project (using asset title or fallback)
 * 2) Assign the asset to that project
 * Returns the new projectId.
 */
export async function createBrandFromAsset(
  asset: BrandableAsset,
  opts: { userId: string; name?: string } = { userId: "" },
): Promise<string> {
  const workspace_id = await ensureActiveWorkspaceId();
  const name = (opts.name || asset.title || "Untitled brand").toString().trim() || "Untitled brand";
  const row: any = { user_id: opts.userId, name };
  if (workspace_id) row.workspace_id = workspace_id;
  let { data, error } = await supabase.from("projects").insert(row).select("id").single();
  if (error && workspace_id && isMissingColumnError(error, "workspace_id")) {
    const retry = await supabase.from("projects").insert({ user_id: opts.userId, name }).select("id").single();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) throw error || new Error("Failed to create brand");
  await addAssetToBrand(asset.id, data.id);
  await setBrandKitCover(data.id, asset);
  void sendBrandKitEmail("brand_kit_created", {
    brand_name: name,
    brand_url: `https://tryrocket.ai/brands/${data.id}`,
  });
  return data.id as string;
}

/** Fetch brand kits (projects) for the current user & active workspace. */
export async function listBrandKits(userId: string): Promise<Array<{ id: string; name: string }>> {
  const workspace_id = await ensureActiveWorkspaceId();
  let q = supabase.from("projects").select("id,name,created_at").eq("user_id", userId);
  if (workspace_id) q = q.eq("workspace_id", workspace_id);
  let { data, error } = await q.order("created_at", { ascending: false }).limit(100);
  if (error && workspace_id && isMissingColumnError(error, "workspace_id")) {
    const retry = await supabase
      .from("projects")
      .select("id,name,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    data = retry.data;
  }
  return (data || []) as Array<{ id: string; name: string }>;
}
