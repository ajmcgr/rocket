import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import SiteHeader from "@/components/SiteHeader";
import ProfileAvatarImage from "@/components/ProfileAvatarImage";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import type { Rocket100Builder, Rocket100Data } from "@/routes/100";
import "./Rocket100.css";

type MyStatus = { username?: string; qualified?: boolean; profile_complete?: boolean; eligible_app_count?: number; owned_app_count?: number; founding_number?: number | null; revoked?: boolean };
const number = (value: number) => String(value).padStart(3, "0");
const displayMrr = (minor: number | null, currency: string | null) => {
  if (minor === null || !currency || !Number.isFinite(Number(minor))) return "—";
  try {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(Number(minor) / 10 ** digits);
  } catch { return "—"; }
};
const displayGrowth = (percent: number | null) => percent === null || !Number.isFinite(Number(percent))
  ? "—" : `${Number(percent) > 0 ? "+" : ""}${Number(percent).toFixed(1)}%`;
type SortKey = "rank" | "mrr" | "growth";
type SortDirection = "asc" | "desc";
const metric = (builder: Rocket100Builder, key: SortKey) => key === "rank" ? builder.rank : key === "mrr" ? builder.mrr_minor : builder.mrr_growth_percent;

export default function Rocket100({ data }: { data: Rocket100Data }) {
  const [board, setBoard] = useState(data);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "rank", direction: "asc" });
  const [status, setStatus] = useState<MyStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
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
      if (active) setStatusLoaded(true);
    })();
    return () => { active = false; };
  }, []);
  const join = async () => {
    track("rocket100_cta_clicked", { state: "qualified" });
    setBusy(true); setNotice("");
    const { data: result, error } = await (supabase as any).rpc("rocket100_join");
    if (error) setNotice(error.message);
    else {
      setNotice(result?.status === "full" ? "The Rocket 100 is complete." : result?.status === "revoked" ? "This account is ineligible for re-entry." : `You're in the Rocket 100. Your member number is #${number(result.founding_number)}.`);
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
  const action = !statusLoaded ? null : !status
    ? <Link to="/signup?next=%2F100" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "signed_out" })}>Join Rocket 100</Link>
    : status.founding_number
    ? null
    : board.participants >= 100
    ? <span className="rocket100-note">The Rocket 100 is complete.</span>
    : status.revoked
    ? <span className="rocket100-note">This account is ineligible for re-entry.</span>
    : !status.profile_complete
    ? <Link to="/settings/profile" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "profile" })}>Complete your profile</Link>
    : !status.eligible_app_count
    ? <Link to="/submit" className="rocket100-button" onClick={() => track("rocket100_cta_clicked", { state: "app" })}>{status.owned_app_count ? "Complete app verification" : "Submit or claim my app"}</Link>
    : <button className="rocket100-button" type="button" disabled={busy} onClick={() => void join()}>{busy ? "Joining…" : "Join the Rocket 100"}</button>;
  const sortedRows = useMemo(() => [...board.rows].sort((a, b) => {
    const aValue = metric(a, sort.key);
    const bValue = metric(b, sort.key);
    const aMissing = aValue === null || !Number.isFinite(Number(aValue)) || (sort.key === "mrr" && !a.mrr_currency);
    const bMissing = bValue === null || !Number.isFinite(Number(bValue)) || (sort.key === "mrr" && !b.mrr_currency);
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    const difference = (Number(aValue) - Number(bValue)) * (sort.direction === "asc" ? 1 : -1);
    return difference || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.username.localeCompare(b.username);
  }), [board.rows, sort]);
  const changeSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === "asc" ? "desc" : "asc" : key === "rank" ? "asc" : "desc" }));
  const structuredData = { "@context": "https://schema.org", "@type": "ItemList", name: "Rocket 100", url: "https://tryrocket.ai/100", itemListElement: board.rows.filter((row) => row.rank !== null).map((row) => ({ "@type": "ListItem", position: row.rank, url: `https://tryrocket.ai/@${encodeURIComponent(row.username)}`, name: row.name || `@${row.username}` })) };
  return <div className="min-h-screen bg-[#f7f9fc] text-[#111827] dark:bg-[#10151d] dark:text-white">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <SiteHeader />
    <main className="rocket100-shell">
      <header className="rocket100-heading">
        <div><h1>Rocket 100</h1><p>Builders ranked by their MRR on Rocket.</p></div>
        <div className="rocket100-heading-actions"><span>{board.participants} / 100 builders</span>{action}</div>
      </header>
      {notice && <p role="status" className="rocket100-notice">{notice}</p>}
      <section id="leaderboard" className="rocket100-board" aria-labelledby="rocket100-board-title">
        <div className="rocket100-board-head"><h2 id="rocket100-board-title">Leaderboard</h2>{board.calculated_at && <small>Updated {new Date(board.calculated_at).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })} UTC</small>}</div>
        <div className="rocket100-table" role="table" aria-label="Rocket 100 leaderboard">
          <div className="rocket100-table-header" role="row">
            <span role="columnheader" aria-sort={sort.key === "rank" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button className="rocket100-sort-button" type="button" onClick={() => changeSort("rank")}>Rank <span aria-hidden="true">{sort.key === "rank" ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></span>
            <span role="columnheader">Builder</span><span className="rocket100-app-count" role="columnheader">Apps</span>
            <span role="columnheader" aria-sort={sort.key === "mrr" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button className="rocket100-sort-button" type="button" onClick={() => changeSort("mrr")}>MRR <span aria-hidden="true">{sort.key === "mrr" ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></span>
            <span role="columnheader" aria-sort={sort.key === "growth" ? sort.direction === "asc" ? "ascending" : "descending" : "none"}><button className="rocket100-sort-button" type="button" onClick={() => changeSort("growth")}>Growth <span aria-hidden="true">{sort.key === "growth" ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span></button></span>
          </div>
          {sortedRows.length ? sortedRows.map((builder) => <Link key={builder.username} to={`/@${builder.username}`} className="rocket100-row" role="row" onClick={() => track("rocket100_profile_clicked", { username: builder.username })}>
            <strong className="rocket100-rank">{builder.rank ? `#${builder.rank}` : "—"}</strong>
            <span className="rocket100-person"><span className="rocket100-avatar"><ProfileAvatarImage src={builder.avatar_url} alt="" className="h-full w-full object-cover" fallback={builder.name?.slice(0, 1) || builder.username[0]} /></span><span><b>{builder.name || `@${builder.username}`}</b><small>@{builder.username}</small></span></span>
            <span className="rocket100-app-count">{builder.app_count}</span><strong className="rocket100-mrr">{displayMrr(builder.mrr_minor, builder.mrr_currency)}</strong><span className="rocket100-growth">{displayGrowth(builder.mrr_growth_percent)}</span>
          </Link>) : <div className="rocket100-empty"><strong>No builders yet.</strong><p>Eligible app owners can join above.</p></div>}
        </div>
        <p className="rocket100-revenue-note">MRR and 30-day growth include only live, verified subscription revenue that app owners have chosen to show exactly. A dash means no public or comparable data is available.</p>
      </section>
    </main>
  </div>;
}
