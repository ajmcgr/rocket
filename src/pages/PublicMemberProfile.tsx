import SiteHeader from "@/components/SiteHeader";
import PublicMemberApps from "@/components/PublicMemberApps";
import { type MemberProfile, safeProfileUrl } from "@/lib/memberProfile";

export default function PublicMemberProfile({ profile }: { profile: MemberProfile | null }) {
  const socials = profile ? [
    ["X", profile.x_username, "https://x.com/"],
    ["Instagram", profile.instagram_username, "https://www.instagram.com/"],
    ["LinkedIn", profile.linkedin_username, "https://www.linkedin.com/in/"],
    ["YouTube", profile.youtube_channel, "https://www.youtube.com/@"],
    ["Telegram", profile.telegram_username, "https://t.me/"],
  ] : [];
  return <div className="marketplace-page min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <SiteHeader />
    <main className="mx-auto max-w-4xl px-4 py-12">
      {!profile ? <h1 className="text-3xl font-semibold">Profile not found</h1> : <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="aspect-[15/4] bg-gradient-to-r from-sky-100 to-blue-200 dark:from-sky-950 dark:to-blue-900">
          {safeProfileUrl(profile.banner_url) && <img src={safeProfileUrl(profile.banner_url)} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="px-6 pb-8 sm:px-10">
          <div className="relative -mt-10 mb-5 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-sky-100 text-3xl font-semibold dark:border-neutral-900 dark:bg-sky-900">
            {safeProfileUrl(profile.avatar_url) ? <img src={safeProfileUrl(profile.avatar_url)} alt="" className="h-full w-full object-cover" /> : (profile.full_name || profile.username)[0].toUpperCase()}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{profile.full_name || profile.username}</h1>
          <p className="mt-1 text-neutral-500">@{profile.username}</p>
          {profile.bio && <p className="mt-5 whitespace-pre-wrap break-words text-base leading-7">{profile.bio}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {safeProfileUrl(profile.website) && <a href={safeProfileUrl(profile.website)} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">Website ↗</a>}
            {socials.filter(([, handle]) => handle).map(([label, handle, base]) => <a key={label} href={`${base}${encodeURIComponent(handle)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">{label} ↗</a>)}
          </div>
        </div>
      </article>}
      {profile && <PublicMemberApps key={profile.username} username={profile.username} />}
    </main>
  </div>;
}
