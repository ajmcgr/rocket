import SiteHeader from "@/components/SiteHeader";
import PublicMemberApps from "@/components/PublicMemberApps";
import PublicMemberCollections from '@/components/PublicMemberCollections';
import MarketplaceFollow from "@/components/MarketplaceFollow";
import ProfileAvatarImage from "@/components/ProfileAvatarImage";
import { type MemberProfile, safeProfileUrl } from "@/lib/memberProfile";
import RocketShare from "@/components/RocketShare";
import { Link } from "@/lib/router-compat";
import type { Rocket100Builder } from "@/routes/100";

export default function PublicMemberProfile({ profile, rocket100 = null }: { profile: MemberProfile | null; rocket100?: Rocket100Builder | null }) {
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
            <ProfileAvatarImage src={profile.avatar_url} alt={`@${profile.username}'s profile photo`} className="h-full w-full object-cover" fallback={profile.username[0].toUpperCase()} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">@{profile.username}</h1>
          {rocket100 && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100"><strong>Rocket 100 · Founding Builder #{String(rocket100.founding_number).padStart(3, "0")}</strong>{rocket100.rank && <span>Current rank #{rocket100.rank}</span>}<span>{rocket100.app_count} eligible {rocket100.app_count === 1 ? "app" : "apps"}</span><Link to="/100" className="font-semibold underline">View leaderboard</Link></div>}
          <div className="mt-4"><RocketShare kind="profile" identifier={profile.username} title={`@${profile.username}`} label="Share profile" /></div>
          {rocket100 && <div className="mt-3"><RocketShare kind="rocket100" identifier={profile.username} title={`Founding Builder #${String(rocket100.founding_number).padStart(3, "0")}`} label="Share Rocket 100 card" version={String(rocket100.rank ?? "") + String(rocket100.founding_number)} /></div>}
          {profile.bio && <p className="mt-5 whitespace-pre-wrap break-words text-base leading-7">{profile.bio}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {safeProfileUrl(profile.website) && <a href={safeProfileUrl(profile.website)} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">Website ↗</a>}
            {socials.filter(([, handle]) => handle).map(([label, handle, base]) => <a key={label} href={`${base}${encodeURIComponent(handle)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">{label} ↗</a>)}
          </div>
          <MarketplaceFollow key={profile.username} target={`developer:${profile.username}`} label="developer" />
        </div>
      </article>}
      {profile && <PublicMemberApps key={profile.username} username={profile.username} />}
      {profile && <PublicMemberCollections key={`collections:${profile.username}`} username={profile.username} />}
    </main>
  </div>;
}
