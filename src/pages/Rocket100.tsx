import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProfileAvatarImage from "@/components/ProfileAvatarImage";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import type { Rocket100Data } from "@/routes/100";
import RocketShare from "@/components/RocketShare";
import "./Rocket100.css";

type MyStatus = { username?: string; qualified?: boolean; internal_account?: boolean; profile_complete?: boolean; eligible_app_count?: number; owned_app_count?: number; founding_number?: number | null; revoked?: boolean };
const number = (value: number) => String(value).padStart(3, "0");

export default function Rocket100({ data }: { data: Rocket100Data }) {
  const [board, setBoard] = useState(data);
  const [status, setStatus] = useState<MyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    track("rocket100_page_viewed");
    let active = true;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!active) return;
      if (user.user) {
        const result = await (supabase as any).rpc("rocket100_my_status");
        if (active && !result.error) { setStatus(result.data || {}); if (result.data?.qualified) track("rocket100_qualified"); }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);
  const join = async () => {
    track("rocket100_cta_clicked", { state: "qualified" });
    setBusy(true); setNotice("");
    const { data: result, error } = await (supabase as any).rpc("rocket100_join");
    if (error) setNotice(error.message);
    else {
      setNotice(result?.status === "full" ? "The founding cohort is complete." : result?.status === "revoked" ? "This account is ineligible for re-entry." : `You're one of the Rocket 100. Founding Builder #${number(result.founding_number)}.`);
      if (result?.status === "awarded") {
        setStatus((previous) => ({ ...previous, founding_number: result.founding_number }));
        track("rocket100_awarded", { founding_number: result.founding_number });
        const refreshed = await (supabase as any).rpc("get_rocket100_leaderboard");
        if (!refreshed.error && refreshed.data) setBoard({
          participants: Number(refreshed.data.participants || 0),
          calculated_at: refreshed.data.calculated_at || null,
          rows: Array.isArray(refreshed.data.rows) ? refreshed.data.rows : [],
        });
      }
    }
    setBusy(false);
  };
  const action = loading ? null : !status
    ? <Link to="/signup?next=%2F100" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "signed_out" })}>Become a Founding Builder</Link>
    : status.founding_number
    ? <a href="#leaderboard" className="rocket100-button">Explore the leaderboard</a>
    : board.participants >= 100
    ? <span className="rocket100-note">The Rocket 100 is complete.</span>
    : status.revoked
    ? <span className="rocket100-note">This account is ineligible for re-entry.</span>
    : status.internal_account
    ? <span className="rocket100-note">Rocket's internal account is not part of the founding cohort.</span>
    : !status.profile_complete
    ? <Link to="/settings/profile" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "profile" })}>Complete your profile</Link>
    : !status.eligible_app_count
    ? <Link to="/submit" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "app" })}>{status.owned_app_count ? "Complete app verification" : "Submit or claim my app"}</Link>
    : <button className="rocket100-button" type="button" disabled={busy} onClick={() => void join()}>{busy ? "Joining…" : "Join the Rocket 100"}</button>;
  const structuredData = { "@context": "https://schema.org", "@type": "ItemList", name: "Rocket 100", url: "https://tryrocket.ai/100", itemListElement: board.rows.filter((row) => row.rank !== null).map((row) => ({ "@type": "ListItem", position: row.rank, url: `https://tryrocket.ai/@${encodeURIComponent(row.username)}`, name: row.name || `@${row.username}` })) };
  return <div className="min-h-screen bg-[#f7f9fc] text-[#111827] dark:bg-[#10151d] dark:text-white">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <SiteHeader />
    <main className="rocket100-shell">
      <section className="rocket100-hero">
        <div className="rocket100-eyebrow">THE FOUNDING COHORT</div>
        <h1>Rocket <span>100</span></h1>
        <p className="rocket100-lead">The first 100 builders shaping the open app platform.</p>
        <p className="rocket100-intro">Meet Rocket's founding builders. Discover the developers creating apps, building their portfolios and earning attention across Rocket.</p>
        <div className="rocket100-actions">{action}<a href="#leaderboard" className="rocket100-secondary">Explore the leaderboard ↓</a></div>
        {notice && <p role="status" className="rocket100-note">{notice}</p>}
        {status?.founding_number && status.username && <div className="mt-5 flex flex-wrap items-center gap-3"><RocketShare kind="rocket100" identifier={status.username} title={`Founding Builder #${number(status.founding_number)}`} label="Share your founding place" /><Link to={`/@${status.username}`} className="rocket100-secondary">View your public profile →</Link></div>}
        <div className="rocket100-counter"><strong>{board.participants} <span>/ 100</span></strong><div><b>Founding places awarded</b><span>{Math.max(0, 100 - board.participants)} places remaining</span></div></div>
      </section>
      <section id="leaderboard" className="rocket100-board" aria-labelledby="rocket100-board-title">
        <div className="rocket100-board-head"><div><span className="rocket100-eyebrow">THE LEADERBOARD</span><h2 id="rocket100-board-title">Builders making their mark.</h2><p>Ranked by app popularity and verified app portfolio. Updated daily.</p></div>{board.calculated_at && <small>Updated {new Date(board.calculated_at).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })} UTC</small>}</div>
        <div className="rocket100-table" role="table" aria-label="Rocket 100 leaderboard">
          <div className="rocket100-table-header" role="row"><span>Rank</span><span>Builder</span><span>Apps</span><span>Popularity</span><span>Score</span></div>
          {board.rows.length ? board.rows.map((builder) => <Link key={builder.username} to={`/@${builder.username}`} className="rocket100-row" role="row" onClick={() => track("rocket100_profile_clicked", { username: builder.username })}>
            <strong className="rocket100-rank">{builder.rank ? `#${builder.rank}` : "—"}</strong>
            <span className="rocket100-person"><span className="rocket100-avatar"><ProfileAvatarImage src={builder.avatar_url} alt="" className="h-full w-full object-cover" fallback={builder.name?.slice(0, 1) || builder.username[0]} /></span><span><b>{builder.name || `@${builder.username}`}</b><small>@{builder.username} · Founding Builder #{number(builder.founding_number)}</small></span></span>
            <span className="rocket100-app-count">{builder.app_count}</span><span className="rocket100-popularity">{builder.popularity === null ? "—" : `${Math.round(builder.popularity)} / 100`}</span><strong className="rocket100-score">{builder.score ?? "—"}</strong>
          </Link>) : <div className="rocket100-empty"><strong>The first places are open.</strong><p>Eligible builders receive a place automatically when they join. No places have been awarded yet.</p></div>}
        </div>
      </section>
      <section className="rocket100-explainer" id="how-rankings-work"><div><span className="rocket100-eyebrow">HOW RANKINGS WORK</span><h2>Earn the place. Build the rank.</h2></div><div><p>Your Founding Builder number is permanent. Your leaderboard rank changes as your eligible apps earn attention on Rocket.</p><p>The score is <strong>70% app popularity</strong> and <strong>30% verified app portfolio</strong>. Popularity uses current bookmarks, published reviews from the last 30 days, and verified production purchases from the last 30 days. More apps have diminishing returns. Scores update daily and paid promotion gives no direct boost.</p><p>App-page views are excluded until Rocket can distinguish sponsored visits from organic visits. Popularity is a Rocket engagement score, not installs, customers, or revenue.</p></div></section>
    </main><SiteFooter />
  </div>;
}
