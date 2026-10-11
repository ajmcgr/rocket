# Rocket SEO launch audit — 11 October 2026

Scope: public Rocket search surfaces, production responses, public catalog data, and the Rocket repository at `e78f52b` before this patch. This is an SEO audit, not a statement about Google's current index. Search Console and field Core Web Vitals were unavailable. All query opportunity and competition judgments below are directional; no search volume or traffic estimate was invented.

## Baseline and technical findings

| Area | Observed production before patch | Patch / disposition |
| --- | --- | --- |
| Architecture | TanStack Start serves HTML for `/`, `/apps/launch`, collections, member profiles, blog and editorial pages. App title, description, H1 and canonical appear in initial HTML. Discover/category result cards and much of the catalog navigation load in the browser. | Kept the framework and existing routes. Category overview names, counts and links now render in initial HTML; filtered category app results still load in the browser. |
| Crawling | `robots.txt` allows crawlers and points to the sitemap. Public representative pages returned 200. Production `/rankings` redirects to `/discover?view=rankings`; `/new` and `/categories/productivity` returned 404, as the actual product uses Discover query routes. | Sitemap and metadata use real routes; no fake `/new` or `/categories/:slug` family was added. `/rising` no longer redirects to `?page=0` in the local build. |
| Metadata | App pages had app-specific metadata. Blog, several editorial routes and Discover variants had generic or client-set metadata in initial HTML. Production `/settings/profile` did not declare `noindex`. | Added server heads for blog, editorial and Discover variants; protected route parent now declares `noindex,nofollow`; removed duplicate client metadata writers. |
| Canonicals | Production Discover query variants lacked a self-canonical. Rising canonical conflicted with the page-zero redirect. UUID app routes already redirect to slugs. | Added self-canonicals for the real category/ranking/new views and paginated Rising; normalized Discover's `view=all` duplicate to the base URL when unfiltered. Existing UUID-to-slug redirect preserved. Ad hoc search/filter parameters are omitted from Discover's canonical; check how Google selects canonicals before any broad index-policy change. |
| Structured data | Blog schema existed. No homepage or representative app schema appeared in production HTML. | Added truthful Organization/WebSite and app SoftwareApplication/BreadcrumbList JSON-LD. No fabricated rating, price, review, download or revenue properties. Removed an unsupported blog `dateModified` assertion. Google's [software-app guidance](https://developers.google.com/search/docs/appearance/structured-data/software-app), [review guidance](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) and [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) remain the validation standard. |
| Sitemap | 5,903 unique URLs: 5,827 apps and 76 static URLs. It omitted live public category views, one nonempty public collection and one public member profile. No `lastmod`. | Build now emits 5,827 app URLs, 22 nonempty category URLs, one nonempty public collection, one public profile and static URLs. Only the collection gets `lastmod`, from its actual update timestamp. Google asks that `lastmod` reflect meaningful, accurate changes; an app timestamp is not exposed by the public projection, so none is invented. [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). |
| Sitemap freshness | The sitemap is generated during the build, while Launch catalog imports run daily. An import can leave public sitemap additions/removals stale until the next deployment. | No runtime sitemap or scheduled rebuild was added. Set a daily post-import sitemap regeneration/deploy job or a safely cached dynamic sitemap after launch; verify withdrawn URLs return appropriate status and leave the next sitemap. This is the most important remaining technical gap. |
| Search measurement | Rocket's own GA4 tag (`G-0SNE7T7S79`) is present in source. Developer-connected GA4 verification is a separate product. No Search Console or GA4 reporting connection was available to this audit. PageSpeed Insights returned HTTP 429, so LCP/INP/CLS have no trustworthy measurement here. | Verify Search Console property, sitemap submission, GA4 organic conversions, and mobile field data with the account owner. Do not interpret absence of tool access as absence of a property. |

Initial HTML matters because Google can render JavaScript but may queue it separately and some crawlers do not render it. Rocket's critical app profile text is server rendered; the remaining browser-loaded category result grids are an index-quality weakness rather than a demonstrated site-wide crawl failure. [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

## Catalog and index quality

The public discoverable view has **5,827** app profiles, matching production sitemap app count. The broader public app view has 5,845 records; it is not the sitemap eligibility source. In the discoverable set, 5,349 have descriptions of at least 160 characters; 78 have fewer than 80 characters. All have a tagline, category and website, 5,211 have platform data, 5,713 have any media, and 3,607 have screenshot media. Only one app has a published review, 17 have public intelligence signals, and three owned apps have public developer attribution. Structured app pricing is absent from the sampled public catalog projection, so broad `[app] pricing` targeting would overpromise. Ten app pages fall in groups with identical normalized descriptions of at least 80 characters. These measures overlap and should not be added together.

Representative pages show the range: Launch has a 195-character description, verified domain, screenshot and one save; Post has a 118-character description and screenshot; Media has a 254-character description and screenshot. Junior has no description but a screenshot; HansaChat has 12 description characters and a screenshot; Ocean Of Products has 19 description characters and no screenshot. The short-description group deserves manual review before indexing policy changes. Rocket cannot yet claim a verified count of Google-indexed pages, orphaned pages, or Rocket/Launch/developer-site verbatim duplication: Search Console, a complete link graph and comparable source HTML were unavailable. The source-side catalog has 5,794 distinct normalized names and 5,638 distinct website hosts, which is not itself evidence of duplicate content.

**Proposed policy, not applied:**

- **INDEX** discoverable, accessible app profiles with an accurate name/category/site and enough original or independently useful material (for example substantive description, screenshots, legitimate developer context, reviews, comparisons or verified signals). Keep worthwhile public collections and real category views indexable.
- **REVIEW** descriptions under 80 characters, no-media listings, duplicated descriptions, stale/withdrawn lineage, and pages that add almost nothing beyond a source site. Require a human/content review and measure Search Console performance before changing robots directives.
- **NOINDEX** private/authenticated pages, absent resources and confirmed low-value/test pages. A broad app noindex rule, bulk redirects or slug migration needs explicit approval and a measured rollout. Keep useful profiles navigable even if they later receive noindex.

Launch import lineage appears intact: 20 completed imports, most recently 11 October 2026 at 09:00 UTC; 6,060 active source records link to 5,843 distinct apps, 217 active source records are ambiguous/unlinked, and two are withdrawn. The import routine updates changed source hashes and hides apps without active sources. New eligible apps and withdrawn apps enter/leave the **next built** sitemap, not necessarily the live sitemap on import day. Slug-change redirect coverage beyond UUID-to-slug was not proven. Avoid automatic slug changes and preserve old routes if any migration is proposed.

There is one nonempty public collection and one public member profile today. Collections and developer profiles are not yet scalable organic surfaces. The 27 blog articles and existing guide/tool pages need an editorial pass for current claims, original insight, broken external links and internal links; this patch does not generate more articles. The current homepage links to discovery, while category overview now exposes HTML links to category results. A full 5,827-page orphan audit remains open; sitemap inclusion alone does not prove internal-link reachability.

## Search opportunities — directional, no volume claims

Priority combines current relevance, intent and catalog advantage. Competition is qualitative, based on current competitor page structures, not a keyword-tool score. Recommended URLs are existing routes or existing pages to improve; no new programmatic page family is authorized here.

| # | Keyword / topic | Intent | Rocket target | Priority | Competition |
| --- | --- | --- | --- | --- | --- |
| 1 | discover new AI apps | Browse | `/discover?view=new` plus AI Agents links | High | High |
| 2 | AI agent apps | Compare category | AI Agents Discover category | High | High |
| 3 | productivity apps for founders | Browse | Productivity category + one curated collection | High | High |
| 4 | AI tools for marketing | Browse | Marketing & Sales category | High | High |
| 5 | developer tools and apps | Browse | Engineering & Development category | High | High |
| 6 | no-code platform apps | Compare category | No-code Platforms category | High | Medium–high |
| 7 | AI voice tools | Compare category | Voice AI Tools category | High | Medium–high |
| 8 | data analysis tools for startups | Browse | Data analysis tools category | High | Medium–high |
| 9 | new software from indie developers | Discover | `/discover?view=new` | High | Medium |
| 10 | app launch checklist | Learn / submit | `/start` and relevant existing guide | High | Medium |
| 11 | publish your app | Submit | `/submit` / `/start` | High | High |
| 12 | promote your app | Evaluate distribution | Existing developer/advertise explainer | High | High |
| 13 | build developer reputation | Learn | Existing developer information page | Medium | Medium |
| 14 | verify app traction | Evaluate product | Existing Rocket Developer / verification explainer | Medium | Medium |
| 15 | monetize an app | Evaluate product | Existing Buy with Rocket explainer | Medium | High |
| 16 | apps built with Lovable | Browse | Curated collection **after** builder attribution is verified | Medium | Medium |
| 17 | apps built with Cursor | Browse | Curated collection **after** builder attribution is verified | Medium | Medium |
| 18 | [specific app] reviews | Evaluate app | App page only when it has genuine published reviews | Medium | Variable |
| 19 | [specific app] alternatives | Compare app | Existing related/comparison content only after editorial verification | Medium | Variable |
| 20 | [specific app] pricing | Transactional research | App page only if current owner-supplied pricing exists | Low now | Variable |

Category pages with substantial current inventory deserve the first editorial introductions: Productivity (3,138), AI Agents (1,212), Design & Creative (1,083), Marketing & Sales (1,072), Platforms (646), Engineering & Development (623), Social & Community (620), and Data analysis tools (351). Give each a precise title, short human-written explanation of what belongs, a handful of genuinely useful app links and one or two relevant links to another category/guide. Very small categories such as SaaS (4), Utilities (1) and Photo & Video (1) should not receive generic long-form SEO copy merely to fill space. Only create collections with actual, verified app membership and an editorial reason to exist.

Current competitor architecture reinforces this approach: [Product Hunt categories](https://www.producthunt.com/categories) organize discovery; [G2 categories](https://www.g2.com/categories) target comparison intent; [Apple charts](https://apps.apple.com/us/iphone/charts/16021) and [Google Play categories](https://play.google.com/store/apps/category/APPLICATION/?hl=en-US) pair app pages with broad browse surfaces; [Gumroad Discover](https://gumroad.com/help/article/79-gumroad-discover) and [Whop browse](https://whop.com/discover/browse/ecommerce/) emphasize commercial listings; [TrustMRR](https://trustmrr.com/) centers verified business signals. Rocket's plausible distinction is an honest combination of app discovery, legitimate developer identity, community feedback and verified traction where available. None of these competitor links establishes comparative traffic.

## Performance and measurement

The app-card image component already emits responsive `srcSet`, lazy loading for nonpriority cards and high fetch priority for priority media. This is useful but not a Core Web Vitals pass. The production build includes sizable shared and editor libraries; route-level chunking exists, but a mobile waterfall and field LCP/INP/CLS are needed before prescribing bundle surgery. Check the homepage hero and first app card on mid-range mobile, image dimensions, console errors and main-thread time. PageSpeed API throttling prevented a lab score in this audit.

Minimum weekly scorecard: Search Console organic clicks, impressions, indexed eligible pages, top queries, top landing pages, sitemap discovered/indexed ratio and crawl errors; GA4 organic app submissions, developer signups and app claims. Keep Rocket site analytics separate from developers' connected GA4 verified-traffic data. Set an event or campaign parameter so sponsored clicks are not reported as organic search growth.

## Ten prioritized wins

| # | Status | Improvement | Why / next check |
| --- | --- | --- | --- |
| 1 | Implemented locally | Server metadata and self-canonicals for real Discover views | Verify production HTML after deployment. |
| 2 | Implemented locally | Include nonempty public categories, collection and profile in sitemap | Compare next production sitemap with public eligibility views. |
| 3 | Implemented locally | Render category overview links in initial HTML | Inspect with JavaScript disabled and test mobile interaction. |
| 4 | Implemented locally | Server metadata for blog, guides, tools and information pages | Confirm no duplicate titles/canonicals after deployment. |
| 5 | Implemented locally | Truthful homepage/app JSON-LD and protected-route noindex | Validate rich-result eligibility without adding fake properties. |
| 6 | Post-launch | Keep sitemap synchronized after daily import | Automate rebuild/publish or a safe cached dynamic feed; verify withdrawn URLs. |
| 7 | Post-launch | Improve thin, unclaimed app profiles | Prioritize the 78 very-short-description candidates and measure claims. |
| 8 | Post-launch | Add original introductions to eight deep categories | Include meaningful app picks and internal links; preserve organic ordering. |
| 9 | Post-launch | Connect Search Console and measure mobile CWV | Establish indexed baseline and actual bottlenecks. |
| 10 | Requires approval | Pilot a reviewed INDEX/REVIEW/NOINDEX policy | No bulk rule until sample review and Search Console impact analysis. |

## 30 / 60 / 90 days

- **Days 0–30:** Deploy and production-smoke the patch; submit/check the sitemap in Search Console; establish weekly dashboard; inventory 78 thin descriptions, 114 no-media listings and the ten duplicate-description pages; run mobile field/lab checks; make sitemap refresh follow the daily import. Highest confidence, low-to-medium effort, with measurable crawl coverage in days/weeks.
- **Days 31–60:** Hand-edit the eight deep category introductions and a small set of high-value app listings; encourage genuine claims/screenshots/reviews; curate two or three clearly useful collections only where membership is verified. Measure indexed category pages, organic category queries, app-claim and signup conversions. Medium effort; search impact may take weeks.
- **Days 61–90:** Expand only proven category/editorial clusters, test legitimate app-review/alternative content with clear evidence, strengthen app→developer→collection links where authorization is real, then review an index-quality pilot using Search Console. Retire ineffective content; avoid mass generated pages. Higher effort; outcomes are directional until measured.

The intended loop is: a new eligible app enters Rocket → its unique, accurate profile and category link are published → organic discovery brings interested visitors → an owner claims the app and adds legitimate detail/media → the stronger profile earns better engagement, real reviews and useful editorial/collection links → Rocket acquires both app users and developers. Daily import freshness and owner participation are the limiting steps; simply listing more URLs will not create authority.

## Validation and release gate

Locally: 108 test files / 451 tests pass; TypeScript passes; production build passes; XML sitemap parses with unique URLs; representative home, app, Discover category/ranking/new, blog, editorial, private, and Rising routes returned expected HTTP/HTML. A post-publish production smoke is still required. No commerce files, routes, Stripe settings, entitlements or webhooks were changed.

**Verdict if post-publish route/sitemap smoke matches the local build:** Rocket SEO is ready for launch. The remaining issues are measurable growth and freshness gaps, not a demonstrated site-wide crawl/indexability blocker. If production app pages cease to return meaningful HTML/200 or the sitemap becomes invalid, stop launch and fix that failure first.
