import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@/lib/router-compat";
import ProfileAvatarImage from "@/components/ProfileAvatarImage";
import { normalizeProfile, profileFields, profileFromData, publicProfileColumns, safeProfileUrl } from "@/lib/memberProfile";

const db = supabase as any;
export default function MemberProfileSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState(profileFromData());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [published, setPublished] = useState("");
  const [password, setPassword] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setPublished("");
    setProfile(profileFromData(user?.user_metadata));
    if (!user) { setLoading(false); return; }
    db.from("member_public_profiles").select(publicProfileColumns).eq("user_id", user.id).maybeSingle()
      .then(({ data, error }: any) => { if (!alive) return; if (error) throw error; if (data) { setProfile(profileFromData(data)); setPublished(data.username); } })
      .catch(() => { if (alive) setError("Your profile could not be loaded. Retry before saving."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id, retry]);
  const update = (key: keyof typeof profile, value: string) => setProfile(p => ({ ...p, [key]: value }));
  const upload = async (file: File, field: "avatar_url" | "banner_url") => {
    if (!user) return;
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!extensions[file.type] || file.size > 5 * 1024 * 1024) { toast({ title: "Use a JPEG, PNG or WebP image under 5 MB", variant: "destructive" }); return; }
    setBusy(field);
    try {
      const path = `${user.id}/${field}-${crypto.randomUUID()}.${extensions[file.type]}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (error) throw error;
      update(field, supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      toast({ title: "Image uploaded", description: "Save profile to publish this change." });
    } catch { toast({ title: "Upload failed. Please try again.", variant: "destructive" }); }
    finally { setBusy(""); }
  };
  const save = async () => {
    if (!user || loading || error || busy) return;
    setBusy("save");
    try {
      const data = normalizeProfile(profile);
      const { error } = await db.from("member_public_profiles").upsert({ ...data, user_id: user.id }, { onConflict: "user_id" });
      if (error) throw new Error(error.code === "23505" ? "That username is already taken." : "Profile could not be saved. Please retry.");
      setProfile(data); setPublished(data.username);
      const result = await supabase.auth.updateUser({ data: { username: data.username, full_name: data.full_name, avatar_url: data.avatar_url } });
      if (result.error) { toast({ title: "Public profile saved", description: "Your account avatar could not be refreshed. Please sign in again." }); return; }
      toast({ title: "Public profile saved" });
    } catch (err) { toast({ title: "Save failed", description: err instanceof Error ? err.message : "Please retry.", variant: "destructive" }); }
    finally { setBusy(""); }
  };
  const updatePassword = async () => {
    setBusy("password");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(""); toast({ title: "Password updated" });
    } catch { toast({ title: "Password update failed. Please retry.", variant: "destructive" }); }
    finally { setBusy(""); }
  };
  return <div className="space-y-6">
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Public profile</h2>{published && <Link to={`/@${published}`} className="text-sm font-medium text-brand hover:underline">View public profile →</Link>}</div>
      <p className="mt-2 text-sm text-neutral-600">These fields are public when you save. Your email and account details stay private.</p>
      {loading && <p role="status" className="mt-4">Loading profile…</p>}
      {error && <p role="alert" className="mt-4 text-red-700">{error} <button onClick={() => setRetry(n => n + 1)} className="underline">Retry</button></p>}
      <fieldset disabled={loading || !!error || !!busy} className="mt-6 space-y-5 disabled:opacity-60">
        {(["avatar_url", "banner_url"] as const).map(field => <div key={field}>
          <label htmlFor={field} className="text-sm font-medium">{field === "avatar_url" ? "Avatar" : "Profile banner"}</label>
          <p className="mt-1 text-xs text-neutral-500">{field === "banner_url" ? "Recommended 1500 × 400. " : ""}JPEG, PNG or WebP, max 5 MB.</p>
          {safeProfileUrl(profile[field]) && (field === "banner_url" ? <img src={safeProfileUrl(profile[field])} alt="Profile banner preview" className="mt-3 aspect-[15/4] w-full rounded-xl object-cover" /> : <ProfileAvatarImage src={profile[field]} alt="Avatar preview" className="mt-3 h-20 w-20 rounded-full object-cover" />)}
          <div className="mt-3 flex flex-wrap items-center gap-3"><input id={field} type="file" accept="image/jpeg,image/png,image/webp" className="max-w-full text-sm" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, field); e.target.value = ""; }} />{profile[field] && <button type="button" onClick={() => update(field, "")} className="rounded-lg border px-3 py-2 text-sm">Remove {field === "banner_url" ? "banner" : "avatar"}</button>}</div>
        </div>)}
        <div><label htmlFor="member-username" className="text-sm font-medium">Username</label><input id="member-username" value={profile.username} maxLength={30} onChange={e => update("username", e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-transparent px-3 text-sm" /><p className="mt-1 text-xs text-neutral-500">Your public link: tryrocket.ai/@{profile.username.toLowerCase().replace(/^@/, "") || "username"}</p></div>
        {profileFields.map(([key, label, limit]) => <div key={key}><label htmlFor={`member-${key}`} className="text-sm font-medium">{label}</label>{key === "bio" ? <textarea id={`member-${key}`} rows={4} maxLength={limit} value={profile[key]} onChange={e => update(key, e.target.value)} className="mt-1 w-full rounded-lg border bg-transparent p-3 text-sm" /> : <input id={`member-${key}`} type="text" maxLength={limit} value={profile[key]} placeholder={key === "website" ? "https://example.com" : key === "full_name" ? "Your name" : "Handle, without @ or a URL"} onChange={e => update(key, e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-transparent px-3 text-sm" />}</div>)}
        <button onClick={save} className="rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-hover">Save profile</button>
      </fieldset>
      {busy && <p role="status" className="mt-3 text-sm">{busy === "save" ? "Saving profile…" : "Uploading image…"}</p>}
    </section>
    <section className="rounded-2xl border bg-white p-6"><h2 className="font-semibold">Account security</h2><label htmlFor="profile-password" className="mt-4 block text-sm">New password</label><input id="profile-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-transparent px-3" /><button disabled={!password || !!busy} onClick={updatePassword} className="mt-4 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Update password</button></section>
  </div>;
}
