import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// The collection migration is additive. Keep existing generated marketplace types intact.
const db = supabase as any;
export type Collection = {
  id?: string;
  name: string;
  slug: string;
  visibility?: "public" | "private";
  updated_at: string | null;
  app_count: number;
  logos: (string | null)[];
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};
export type CollectionApp = Tables<"public_apps">;
export const COLLECTION_PAGE_SIZE = 24;
export function collectionPath(collection: Collection, personal = false) {
  if (collection.slug === "saved" && !collection.id) return "/saved-apps";
  return `${personal ? "/my-collections" : "/collections"}/${encodeURIComponent(collection.slug)}`;
}
export async function publicCollections(offset = 0, username?: string) {
  let query = db
    .from("public_user_collections")
    .select("*")
    .gt("app_count", 0)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(offset, offset + COLLECTION_PAGE_SIZE);
  if (username) query = query.eq("username", username);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Collection[];
}
export async function myCollections() {
  const [saved, custom] = await Promise.all([
    db.from("my_saved_collection").select("*").single(),
    db
      .from("my_user_collections")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id"),
  ]);
  if (saved.error || custom.error) throw saved.error || custom.error;
  return [saved.data, ...(custom.data || [])] as Collection[];
}
export async function createCollection(
  name: string,
  visibility: "private" | "public" = "private",
) {
  const { data, error } = await db
    .from("user_collections")
    .insert({ name: name.trim(), visibility })
    .select("id,name,slug,visibility")
    .single();
  if (error) throw error;
  return data as Collection;
}
export async function updateCollection(
  id: string,
  changes: { name?: string; visibility?: "private" | "public" },
) {
  const { data, error } = await db
    .from("user_collections")
    .update(changes)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data)
    throw error || new Error("Collection could not be changed.");
}
export async function deleteCollection(id: string) {
  const { data, error } = await db
    .from("user_collections")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data)
    throw error || new Error("Collection could not be deleted.");
}
export async function setCollectionMembership(
  collectionId: string,
  appId: string,
  included: boolean,
) {
  const { error } = included
    ? await db
        .from("collection_apps")
        .insert({ collection_id: collectionId, app_id: appId })
    : await db
        .from("collection_apps")
        .delete()
        .eq("collection_id", collectionId)
        .eq("app_id", appId);
  if (error && !(included && error.code === "23505")) throw error;
}
export async function collectionDetail(slug: string, personal = false) {
  const { data, error } = await db
    .from(personal ? "my_user_collections" : "public_user_collections")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Collection | null;
}
export async function collectionApps(collectionId: string, offset = 0) {
  // Inner join filters hidden listings before pagination; same public listing projection as Saves.
  const { data, error } = await db
    .from("collection_visible_apps")
    .select("*")
    .eq("collection_id", collectionId)
    .order("added_at", { ascending: false })
    .order("id")
    .range(offset, offset + COLLECTION_PAGE_SIZE);
  if (error) throw error;
  return (data || []) as CollectionApp[];
}
