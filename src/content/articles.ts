export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  readTime: string;
  date: string;
  body: string;
  /** Optional overrides — everything below is auto-derived when omitted,
   *  so the daily publishing workflow keeps working unchanged. */
  category?: string;
  tags?: string[];
  author?: string;
  cover?: string;
  faq?: { question: string; answer: string }[];
};

const md = (s: string) => s.replace(/^\s+/gm, "");

export const articles: Article[] = [
  {
    slug: "make-your-product-a-brand",
    title: "Make Your Product a Brand: Why Positioning Beats Features",
    excerpt: "Founders ship features. Brands ship meaning. Here's how to make the jump.",
    readTime: "6 min",
    date: "2026-06-10",
    body: md(`# Make Your Product a Brand

Most indie products die not because the code is bad, but because no one can describe what they are in one sentence. A brand is the shortcut your audience takes to remember you, recommend you, and choose you when three competitors are open in adjacent tabs.

Features are easy to copy. Positioning is not. The companies that win the long game are the ones that own a single, sharp idea in their customer's head — Linear owns "fast issue tracking for serious teams," Superhuman owns "the fastest email experience ever made," Notion owns "one tool for your whole brain." None of those sentences mention a feature.

## The 3 layers of brand

### 1. Category — the shelf you live on
If a customer can't slot you into a mental category in under three seconds, you don't exist. Either pick an existing category and become the best-positioned option in it, or invent a new one and become the only option. "AI-native CRM for solo founders" is a category. "Productivity software" is not.

### 2. Promise — the one outcome you guarantee
Not three outcomes. One. The promise is the thing a customer will quote back to a friend. "Inbox zero in 20 minutes a day." "Ship a landing page before lunch." "Never write a cold email from scratch again." If you can't write yours in under twelve words, you haven't found it yet.

### 3. Vibe — the feeling you leave behind
Vibe is the part most founders skip and most brands win on. It lives in your typography, your microcopy, the tone of your error states, the music in your demo video. Linear feels precise. Figma feels playful. Stripe feels trustworthy. None of that is an accident.

If a stranger can repeat all three layers after ten seconds on your homepage, you have a brand. If they can only repeat a feature list, you have a product.

## Tactics that compound

- **Lead with a verb, not a noun.** "Ship faster" beats "A platform for engineering teams" every time.
- **Pick a fight with the status quo.** Brands are built on contrast. Name the old way and explain why it's broken.
- **Make your tagline portable.** It should survive on a sticker, a podcast intro, a one-line bio, and the side of a coffee cup.
- **Repeat yourself on purpose.** The first time you say your positioning out loud you'll cringe. By the hundredth time it will start to land. Don't change it because *you* are bored.
- **Audit every surface.** Your 404 page, your billing receipts, your onboarding emails — they all either reinforce the brand or quietly erode it.

## A simple exercise

Open a blank doc. Write three sentences:

1. We are the **[category]** for **[audience]**.
2. We help them **[one specific outcome]**.
3. Unlike **[the obvious alternative]**, we **[the contrarian thing you do]**.

Read it out loud. If you stumble, rewrite. If a friend can repeat it back ten minutes later, you've got something worth putting on a homepage.

Rocket auto-generates all three layers from your URL in under sixty seconds — but the words only stick when you commit to repeating them everywhere, on purpose, for longer than feels comfortable.`),
  },
  {
    slug: "the-perfect-product-hunt-launch",
    title: "The Perfect Product Hunt Launch (2026 Edition)",
    excerpt: "A repeatable framework that gets you in the Top 5 — without begging upvotes.",
    readTime: "9 min",
    date: "2026-06-08",
    body: md(`# The Perfect Product Hunt Launch

Product Hunt is still the cheapest distribution event on the internet. A Top 5 finish reliably ships 2,000–5,000 visitors, 50–200 signups, a wave of inbound press, and at least a few "let's chat" emails from investors. The catch: the playbook from 2021 doesn't work anymore. Here's what does in 2026.

## 14 days before

- **Pick a Tuesday or Wednesday.** Avoid Mondays (staff picks dominate), Fridays (low traffic), and any U.S. holiday week.
- **Write three taglines.** Run them as $10 X ads with the same image. Whichever one wins becomes your PH tagline.
- **Line up a hunter only if they ship results.** Most "top hunters" don't move the needle anymore. Hunting yourself is usually fine.
- **Build your gallery.** Six images, square format, one short looping video. The first image is your tagline rendered as a graphic — not a screenshot.
- **Warm up your network.** DM 50 people the week before with "I'm launching Tuesday, would love your honest first impression" — not "please upvote me."

## 48 hours before

- Submit your draft. PH staff sometimes reach out with feedback.
- Pre-write your first comment, your maker comment, three replies to predictable questions, and the X thread.
- Test the entire signup flow on a fresh browser, in airplane mode, on mobile, at 2 AM. Whatever breaks tomorrow will be embarrassing in front of 5,000 strangers.

## Launch day

- **12:01 AM PT** — Product goes live. Post your maker comment immediately: the *story* of why you built it, not the spec sheet.
- **12:05 AM PT** — Send the launch email to your list. Subject line: "We're live on Product Hunt." No emoji.
- **8 AM PT** — Post your X thread. Pin it. Reply to the first ten comments yourself.
- **First four hours** — Reply to every PH comment within ten minutes. Tone: human, specific, grateful.
- **Lunch** — Post in two relevant Slack/Discord communities you've been active in. Never paste a link in a community you haven't contributed to.
- **5 PM PT** — Recap tweet with a screenshot of your ranking. Thank specific people by name.

## What actually moves the needle in 2026

- A demo video under sixty seconds, captioned, that works on mute.
- A genuine "why I built this" maker comment with a real story and a real flaw you admit.
- Cross-launching the same day on X, LinkedIn, IndieHackers, your newsletter, and (carefully) one or two niche subreddits.
- Replying to *every* comment for the full 24 hours. The algorithm rewards engagement, not raw upvote count.
- A free, useful artifact people can take home even if they don't sign up — a template, a checklist, a Notion doc.

## What doesn't work anymore

- Begging upvotes in DMs. PH detects it and shadow-deflates your rank.
- Generic "We just launched 🚀" tweets. No one cares.
- Saving your launch for "when the product is ready." It will never be ready. Launch the version that solves one problem well.

## After the launch

- Day +1: thank-you post, public metrics, screenshot of the badge.
- Day +3: write a retro. Even mediocre launches go viral as retros.
- Day +7: email everyone who signed up with a personal note. Half of your long-term revenue starts here.

Rocket generates your maker comment, X thread, launch email, and directory submissions in one pass so you can spend launch day talking to humans instead of writing copy.`),
  },
  {
    slug: "10-launch-channels-for-vibe-coders",
    title: "10 Launch Channels Every Vibe Coder Should Use",
    excerpt: "Beyond Product Hunt: the underrated distribution channels in 2026.",
    readTime: "7 min",
    date: "2026-06-05",
    body: md(`# 10 Launch Channels for Vibe Coders

If you only launch on Product Hunt, you're leaving 60% of your possible first-month traffic on the table. The channels below are where the smart vibe coders are quietly winning in 2026.

## 1. Product Hunt
Still the single best one-day spike. Top 5 finish = 2k–5k visitors. Best for consumer and prosumer tools. Tuesday/Wednesday launches.

## 2. BetaList
Early-adopter SaaS gold. The audience is hungry for new tools and forgiving of rough edges. Lead time is 2–6 weeks; submit early.

## 3. There's An AI For That
AI-product SEO juice. Listings rank fast on Google for "[category] AI tool" queries. Worth it even if you're only AI-adjacent.

## 4. Hacker News (Show HN)
Tuesday and Wednesday mornings PT work best. Title format: "Show HN: [Product] – [one-line value prop]." Engage in the comments with humility and technical depth. A front-page hit ships 10k+ visitors and lasting backlinks.

## 5. Peerlist
Strong engineering audience. Great for dev tools, APIs, and anything technically interesting. Lower volume than PH but very high signal.

## 6. Uneed
Friday weekly drops. The audience is design-conscious and converts well for productivity and design tools.

## 7. Alternative.me
Long-tail comparison traffic that compounds for years. Get listed as an alternative to your three biggest competitors and you'll keep collecting trial signups every month.

## 8. G2
B2B credibility. Even five real reviews on G2 will quietly close enterprise deals you didn't know were happening. Worth the setup pain.

## 9. Indie Hackers
Story-driven posts only. "How we got our first 100 users" beats "Check out our launch" by 100x. Be specific, share numbers, admit mistakes.

## 10. Reddit
Niche subs only. Posting in r/SaaS or r/startups is shouting into a void. Find the three subreddits where your *customers* hang out — and contribute for two weeks before you ever drop a link.

## Bonus: the underrated five

- **Lobsters** — technical audience, invite-only, but a front-page post is gold.
- **Tiny Launch** — small but warm; good for very early MVPs.
- **MicroLaunch** — weekly leaderboard format.
- **Fazier** — newer PH-style site with engaged early adopters.
- **Toolify** — AI directory with surprising long-tail SEO weight.

## How to submit to all of them in one afternoon

1. Write your master copy once: name, one-liner, 50-word description, 250-word description, five tags, one square logo, one 16:9 banner.
2. Open all submission forms in tabs.
3. Paste, tweak, submit. Two hours max.
4. Track responses in a single spreadsheet so you can follow up.

Rocket auto-fills every directory form from your URL — including the awkward 250-word ones — so you can ship all ten in an afternoon instead of a week.`),
  },
  {
    slug: "writing-a-tagline-that-converts",
    title: "Writing a Tagline That Converts (and Survives a Year)",
    excerpt: "The 4-word formula behind the best SaaS taglines of all time.",
    readTime: "5 min",
    date: "2026-06-02",
    body: md(`# Writing a Tagline That Converts

Your tagline is the single most-read piece of copy you'll ever write. It shows up in your hero, your meta description, your X bio, your podcast intros, your investor decks. Get it right and it does the selling for you for years. Get it wrong and every other piece of marketing works twice as hard to compensate.

## The two formulas that work

### Verb + Object
"Send better emails." "Ship landing pages faster." "Track issues without the meetings."

The verb does the heavy lifting. It tells the customer what *they* will do, not what your software is. Notice how all three examples are things a human says about themselves, not things a marketer says about a product.

### Outcome you envy
"Sleep through your launch." "Inbox zero, every day, forever." "Get your weekend back."

These taglines skip the product entirely and describe the life on the other side of using it. They work best when the pain you solve is emotional, not just functional.

## What to avoid

- **Adjectives.** "Powerful, intuitive, modern" means nothing. Cut them all.
- **Jargon.** If your mom can't read it out loud, rewrite it.
- **Your company name.** The tagline's job is to explain, not repeat.
- **The word "platform."** It is the most overused, least specific word in SaaS. So is "solution."
- **Two ideas joined by a comma.** Pick one.

## The five-word test

Read your tagline. Count the words. If it's more than seven, cut. If you can't cut without losing meaning, the meaning isn't sharp enough yet. The best taglines in history are 2–5 words: *Just do it. Think different. Save time. Ship faster.*

## The sticker test

Imagine your tagline printed on a laptop sticker someone wears at a conference. Would a stranger read it and want to ask what the product does? If yes, you have something. If no, keep writing.

## A quick generation loop

1. Write twenty taglines in one sitting. Bad ones are fine.
2. Walk away for an hour.
3. Circle the five that still make you flinch with pride.
4. Read each out loud in a sentence: "I use Rocket — it's the [tagline]." Whichever sounds least awkward wins.

Rocket's Tagline Generator gives you ten options in five seconds — but the winner is always the one *you* are willing to repeat a thousand times without getting bored.`),
  },
  {
    slug: "the-launch-week-checklist",
    title: "The Complete Launch Week Checklist",
    excerpt: "Hour-by-hour, from Sunday prep to Saturday recap.",
    readTime: "11 min",
    date: "2026-05-30",
    body: md(`# Launch Week Checklist

A launch isn't a day, it's a week. The founders who treat it like a single Tuesday burn out by Wednesday and miss the long tail that actually drives revenue. Here's an hour-by-hour playbook you can copy.

## Sunday — Prep
- Final QA. Break your own product on mobile, in Safari, on a slow connection.
- Lock the landing page copy. No more edits after 6 PM.
- Schedule your X thread for 9 AM PT Tuesday.
- Pre-write the launch email and queue it in your ESP.
- Tell your partner / roommates / dog that you'll be useless until Thursday.

## Monday — Soft launch
- Email your list a private link. Subject: "Sneak peek before tomorrow."
- Ask for honest feedback, not upvotes.
- Post a teaser GIF on X. No link. Just curiosity.
- DM 20 friendlies the PH preview URL.
- Sleep early. Tomorrow starts at midnight.

## Tuesday — Launch day
- **12:01 AM PT** — Product Hunt goes live. Post maker comment. Send launch email.
- **12:30 AM PT** — Reply to the first wave of comments.
- **6 AM PT** — Coffee. Quick metric check. Don't refresh obsessively.
- **8 AM PT** — Publish and pin your X thread. Tag three people who genuinely helped.
- **10 AM PT** — Post to IndieHackers, LinkedIn, and your one warm subreddit.
- **12 PM PT** — LinkedIn personal post (different angle than X).
- **2 PM PT** — Submit to BetaList, Peerlist, Uneed, There's An AI For That, Alternative.me, Fazier.
- **4 PM PT** — Record a 60-second "thanks, here's what's happening" video for X.
- **8 PM PT** — Final reply pass. Then close the laptop.

## Wednesday — Momentum
- Reply to every single comment from yesterday.
- Send a personal thank-you email to anyone who signed up.
- Post a "day 1 numbers" tweet with real metrics.
- DM five new users and ask what almost stopped them from signing up.

## Thursday — Press and partners
- Pitch three niche newsletters with a personal angle (not a press release).
- Reach out to two complementary tools about a cross-promo.
- Post in one Slack/Discord you're already a member of.

## Friday — Compound the SEO
- Publish a launch blog post (this one counts).
- Submit to two more directories you skipped Tuesday.
- Reply to every X reply, even the late ones.

## Saturday — Retro
- Write a public retro. Numbers, mistakes, surprises, next step.
- People love a post-mortem more than a launch.
- Schedule the next launch for ~6 weeks out. Momentum compounds.

## Sunday — Off
- Genuinely off. The product will survive one day without you.

Rocket generates the email, the X thread, the LinkedIn post, the maker comment, the directory copy, and the retro outline from a single URL — so launch week is execution, not writing.`),
  },
  {
    slug: "from-zero-to-first-100-users",
    title: "From Zero to First 100 Users (Without Paid Ads)",
    excerpt: "Manual outreach scales further than founders think.",
    readTime: "8 min",
    date: "2026-05-27",
    body: md(`# Zero to 100 Users

Stop building. Start DMing. The first 100 users come from 1,000 personal messages, not 1,000,000 impressions. Paul Graham called it "do things that don't scale." Eight years later it's still the only reliable playbook for going from 0 to 100.

## Why manual outreach works (and ads don't yet)

You don't know your messaging. You don't know your ICP. You don't have proof. Paid ads only work when all three are dialed in. Until then, every dollar you spend on ads is just buying noisy data. Manual conversations buy you *signal*: the exact words your customers use, the objections that kill deals, the angle that makes someone lean forward.

## The 4-channel split

- **40% Twitter/X DMs.** Reply to public posts where someone describes the problem you solve. Then DM with context. Never lead with a pitch.
- **30% LinkedIn.** Cold message decision-makers with one specific observation about their company. Two sentences max. No "synergy."
- **20% Reddit / Discord / Slack.** Find the three communities where your customer hangs out. Contribute for two weeks. Then mention your product *only when relevant*.
- **10% Email.** Personal, short, signed with a real name. Subject line: "quick q about [their company]."

## The script that works

> Hey [name] — saw your post about [specific thing]. I'm building [product] which does [specific outcome]. Not pitching — would love your gut reaction to the landing page if you have 60 seconds. Here it is: [link]. Either way, good luck with [their thing].

Three things make this work: a specific reference (proves you're human), a tiny ask (60 seconds), and an exit ramp (not pitching). Reply rates are 30–50% when sent to the right people.

## Volume math

- 20 DMs/day × 5 days = 100 DMs/week.
- 30% reply = 30 conversations.
- 30% of those try the product = 9 signups.
- Repeat for 11 weeks = your first 100 users.

It's boring. It works.

## The trap

Around user 30, you'll be tempted to "scale" by sending the same message to 500 people via a tool. Don't. The moment your DMs look automated, the reply rate falls to 1% and your X account gets flagged. Stay manual until you have product-market fit. Then automate.

## What to do *during* the conversation

- Ask what they were using before.
- Ask what almost made them not reply.
- Ask what they'd tell a friend about your product in one sentence.
- Write down their exact words. That's your next landing page headline.`),
  },
  {
    slug: "the-elevator-pitch-formula",
    title: "The Elevator Pitch Formula That Closes",
    excerpt: "Three sentences that win meetings, investors, and customers.",
    readTime: "4 min",
    date: "2026-05-24",
    body: md(`# The Elevator Pitch Formula

An elevator pitch isn't an elevator pitch if it takes longer than an elevator ride. Thirty seconds. Three sentences. One job: make the listener ask a follow-up question.

## The formula

> We help **[specific audience]** do **[specific outcome]** without **[specific pain]**. Unlike **[the obvious alternative]**, we **[the contrarian thing you do]**. Customers like **[recognizable name or persona]** use us to **[concrete result]**.

That's it. Fill it in. Read it out loud. Cut every adjective.

## A worked example

> We help indie founders launch their startup in a day without writing a single line of marketing copy. Unlike generic AI writers, we generate everything from your live URL so the copy actually matches your product. Solo makers use Rocket to ship a full launch kit before their first coffee.

Three sentences. Twelve seconds. Zero jargon.

## Common mistakes

- **Starting with "We are a platform that..."** Cut. Start with the audience and the outcome.
- **Listing features.** Save them for the follow-up question.
- **Vague audience.** "Small businesses" is not an audience. "Solo founders launching their first SaaS" is.
- **No contrast.** Without an "unlike X," you sound like everyone else.
- **Memorized robot voice.** Practice until it sounds like you're saying it for the first time.

## How to practice

Say it out loud ten times today. Then say it to a friend tomorrow and watch their face. Tighten anything that makes them squint. By the time you've said it a hundred times, you'll deliver it in your sleep — which is good, because you'll need to.`),
  },
  {
    slug: "the-anatomy-of-a-viral-launch-tweet",
    title: "The Anatomy of a Viral Launch Tweet",
    excerpt: "What 50 viral launch threads have in common.",
    readTime: "6 min",
    date: "2026-05-20",
    body: md(`# Viral Launch Tweets

We pulled apart 50 launch threads that crossed a million views in the last 12 months. They have almost nothing in common — except these five things.

## 1. The hook is a pattern interrupt in seven words or fewer

- "I just quit my $400k job."
- "We replaced our entire sales team."
- "This shouldn't have worked. It did."

The hook's only job is to stop the scroll. It does not need to mention your product. It needs to make someone read the second line.

## 2. Show, don't tell

Tweet 1: hook + image or 6-second silent video. No link. The image carries 80% of the engagement. If your demo doesn't work on mute, re-record it.

## 3. Personal stakes

"I built this in 3 weeks while my baby slept." "I spent my last $5k on this launch." "My co-founder quit halfway through." People retweet humans, not features. Put yourself in the thread.

## 4. Specific numbers

"$0 to $12k MRR in 47 days." "From idea to launch in 19 hours." "1 founder, 0 employees, 12,000 users." Round numbers feel fake. Specific numbers feel earned.

## 5. One clear CTA at the end

- "Try it free → [link]"
- "RT if you want me to write up the playbook."
- "Reply 'send' and I'll DM you the template."

Pick one. Two CTAs = zero CTAs.

## The structure

1. **Hook** (1 line, 7 words, image/video)
2. **Stakes** (why you built it)
3. **The reveal** (what it is)
4. **3 specific outcomes** (numbers or screenshots)
5. **Behind the scenes** (one tactical detail no one else shares)
6. **CTA** (single, clear, link)

## What kills launch threads

- Starting with "Excited to announce..."
- Emoji rocket ships.
- Burying the link in tweet 9.
- Tagging influencers who don't know you.
- Posting at 2 AM your time because "the algorithm." Post when you can reply for 4 hours straight.`),
  },
  {
    slug: "naming-your-startup",
    title: "How to Name Your Startup in 2026",
    excerpt: "The 5 rules of modern SaaS naming (and the 3 things to avoid).",
    readTime: "7 min",
    date: "2026-05-17",
    body: md(`# Naming Your Startup

Your name is the cheapest piece of marketing you'll ever buy and the most expensive one to change later. Spend a weekend on it. Don't spend a month.

## The 5 rules

### 1. Two syllables max (ideally one)
Stripe. Linear. Notion. Figma. Vercel. Loom. Rocket. Short names are easier to say, remember, and put on a logo.

### 2. Easy to spell over the phone
If you have to say "that's L-Y-N-Q with a Q" you've already lost. Test it: call a friend, say the name once, ask them to type the URL.

### 3. A real domain you can actually own
.com if you can afford it, .ai if you're AI-adjacent, .so / .co / .dev as fallbacks. Avoid anything with hyphens, double letters from a missing vowel, or a misspelling that requires explanation forever.

### 4. No numbers, no "ly" suffix
The "-ly" era ended in 2018. Numbers in names are SEO and SEM nightmares.

### 5. It either says what it does, or invents a category
Two valid strategies: descriptive ("Calendly tells you it's a calendar") or evocative ("Stripe tells you nothing but feels modern"). The dead middle — vaguely techy nonsense words like "Quantix" — is where bad names live.

## The 3 things to avoid

- **Trademark conflicts.** Run a USPTO + EU search before you fall in love.
- **Negative meanings in other languages.** Five minutes on Google saves five years of awkwardness.
- **Names that pin you to one product.** "ColdEmailGPT" is great until you add a second feature.

## A 90-minute naming sprint

1. List 20 nouns and 20 verbs related to your category (10 min).
2. Mash them into 50 combinations (20 min).
3. Check .com / .ai availability for the top 15 (15 min).
4. Trademark-check the surviving 5 (15 min).
5. Say each one out loud in a sentence: "Hi, I'm building [name], we help…" Pick the one that doesn't make you flinch (10 min).
6. Buy the domain immediately (5 min). Sleep on it. If you still like it tomorrow, ship.

Rocket's Brand Name Generator runs this sprint for you in thirty seconds and only shows names with available domains.`),
  },
  {
    slug: "the-founder-bio-that-gets-replies",
    title: "Writing a Founder Bio That Actually Gets Replies",
    excerpt: "Your X bio is a landing page. Treat it like one.",
    readTime: "5 min",
    date: "2026-05-14",
    body: md(`# The Founder Bio Formula

Your X bio is the most-read piece of personal copy you'll ever write. Every cold DM you send, every reply you leave, every quote-tweet someone shares — your bio is the first thing the reader checks. If it doesn't earn the click within two seconds, the conversation ends before it starts.

## The 3-slot formula

- **Slot 1 — Who you help.** "Helping indie founders launch faster."
- **Slot 2 — What you ship.** "Building Rocket → launch kits in 60 seconds."
- **Slot 3 — Proof or personality.** "Ex-Stripe. Dad. Bad at golf."

Three lines. That's the whole bio. Anything more is decoration.

## A worked example

> Helping solo founders ship full launches before lunch.
> Building @tryrocket → /create
> Ex-Stripe · 2x exit · dog person

Read it. Notice what's missing: no emoji wall, no "passionate about," no list of hashtags. Every word earns its place.

## What to cut

- **"Founder & CEO of [your own one-person company]"** — everyone knows.
- **Emoji chains.** One per line, maximum.
- **"Passionate about X."** Show it, don't claim it.
- **Hashtags.** This isn't 2012.
- **Quotes from dead philosophers.** No.

## What to add

- A clear "→" pointing to one URL. One.
- A single piece of credibility — a logo, a number, an outcome.
- One human detail. People follow people, not job descriptions.

Rocket's Twitter Bio Generator writes all three slots from your URL in five seconds, with three variations to pick from.`),
  },
  {
    slug: "the-cold-email-that-books-demos",
    title: "The Cold Email Template That Books Demos",
    excerpt: "4 lines. 90% reply rate when targeted well.",
    readTime: "6 min",
    date: "2026-05-11",
    body: md(`# Cold Email That Works

The cold emails that actually book demos in 2026 look nothing like the ones from a sales course. They are short, specific, and obviously written by a human. Here's the four-line template that consistently hits 30–50% reply rates when targeted well.

## The template

**Subject:** quick q about [their company]

> Hey [first name] —
>
> Noticed [specific observation about their product, hiring page, or recent post].
> We built [product] for exactly that — [one-sentence outcome].
> [One-sentence proof: a customer, a number, a name they'd recognize].
> Worth a 15-min call next week, or should I send a 2-minute Loom instead?
>
> — [your first name]

## Why each line works

- **Subject** — lowercase, no punctuation, sounds like a friend. Open rates jump 2–3x vs. anything that smells like a campaign.
- **Line 1 (observation)** — proves you didn't blast 10,000 people. This is the single highest-leverage sentence in the email.
- **Line 2 (connect)** — links their world to your product in one breath.
- **Line 3 (proof)** — one customer, one metric, or one logo. Not three.
- **Line 4 (ask)** — give two cheap options. The Loom offer often wins.

## What kills cold emails

- Subject lines like "Transform your business" — straight to spam.
- Long opening paragraphs about your company.
- More than one link.
- Calendar links in the first email.
- Sending on Monday morning or Friday afternoon. Tuesday/Wednesday 10 AM their time wins.

## Targeting > template

The template only works if you've actually researched the recipient. Spend 90 seconds per email: skim their site, their last LinkedIn post, their hiring page. The "specific observation" is the entire game. No template can fake it.

## Follow-up cadence

- Day 0 — initial email.
- Day 4 — short bump: "Bumping this — happy to send the Loom either way."
- Day 10 — one-line value: "Saw [news about their company] — congrats. Still happy to share what we'd do."
- Then stop. Three touches, then move on.`),
  },
  {
    slug: "directories-that-actually-drive-traffic",
    title: "The 9 Directories That Actually Drive Traffic",
    excerpt: "We submitted to 40+. These 9 paid off.",
    readTime: "8 min",
    date: "2026-05-08",
    body: md(`# Directories Worth Your Time

Over the last year we submitted Rocket to 43 directories and tracked the traffic each one sent over the following 90 days. Nine of them sent more than 100 visitors. The rest sent fewer than 20 combined. Here are the nine that earn the afternoon.

## The list, ranked by sustained traffic

### 1. Product Hunt
Launch-day spike of 2k–5k, plus a permanent SEO page that keeps ranking. The single highest-ROI directory if you commit to a real launch.

### 2. There's An AI For That
Compounds for AI and AI-adjacent products. Listings rank fast on Google for "[category] AI" queries. Quiet 100–300 monthly visitors for years.

### 3. Hacker News (Show HN)
Not technically a directory, but a single front-page hit ships 10k+ visitors and high-DA backlinks that lift everything else you do.

### 4. BetaList
Lower volume than PH but very warm audience. Great for capturing early waitlist signups before launch.

### 5. Alternative.me
Long-tail comparison traffic. Get listed as an alternative to your top three competitors and you'll collect signups monthly with zero effort.

### 6. G2
Enterprise credibility. Even five real reviews close deals you didn't know were in motion.

### 7. Peerlist
Strong technical audience. Best for dev tools, APIs, and infrastructure.

### 8. Uneed
Friday weekly drops. Design and productivity tools convert especially well here.

### 9. Indie Hackers
Story posts >> directory listings. Treat IH like a writing platform, not a directory.

## What didn't work (and why)

- **General "startup directories" with 50,000 listings.** Page rank too low, audience too cold.
- **Pay-to-play directories that promise PR.** Cancelled checks, zero traffic.
- **Old AI directories from 2023.** Most are scraping each other now.
- **Country-specific directories** unless you're targeting that country.

## How to submit efficiently

1. Write your master kit once: name, tagline, 50-word, 250-word, logo, banner, 5 tags.
2. Set aside one Tuesday afternoon.
3. Open all nine submission forms in tabs.
4. Paste, tweak, submit. Track each in a spreadsheet with submission date, expected publish date, and link.
5. Follow up once after two weeks if your listing isn't live.

Rocket auto-fills every form from your URL so the whole job takes 30 minutes instead of a week.`),
  },
  {
    slug: "positioning-101-for-indie-hackers",
    title: "Positioning 101 for Indie Hackers",
    excerpt: "April Dunford's framework, distilled for solo founders.",
    readTime: "9 min",
    date: "2026-05-05",
    body: md(`# Positioning 101

April Dunford's *Obviously Awesome* is the best book on positioning ever written. It's also written for VPs of Marketing at 200-person B2B companies. Here's the same framework rebuilt for a solo founder shipping on a Tuesday.

## The 5 components

### 1. Competitive alternatives
What would your customer use if your product didn't exist? Not "nothing." Real options: a spreadsheet, a competitor, a freelancer, doing it manually. Write the list. Five entries minimum.

### 2. Unique attributes
What do *you* have that none of those alternatives have? Be honest. A nicer UI is not an attribute. A real one looks like: "generates copy from a live URL instead of a blank prompt" or "ships finished email sequences, not just snippets."

### 3. Value
Translate each unique attribute into a customer outcome. Attribute: "generates from live URL." Value: "founder doesn't have to write a brief or fill in fields." Value sentences always start with the customer, never with you.

### 4. Best-fit customer
Of all the people who might buy this, who cares *most* about the unique value? Be uncomfortably narrow. "Solo founders launching their first SaaS this month" is a position. "Small businesses" is not.

### 5. Market category
Pick the shelf you're competing on. Two options:
- **Win an existing category** — be the obvious choice in a known shelf.
- **Invent a new category** — give the shelf a name no one else can claim.

Most indie products should win an existing category first. Inventing one is a 2-year marketing project.

## Putting it together

Write one paragraph with all five components:

> For **[best-fit customer]**, the only way to **[outcome]** today is **[alternative]** — which is **[the pain]**. **[Your product]** is a **[market category]** that **[unique attribute]**, so customers can **[the value]**.

Read it out loud. If a stranger nods, you have a position. If they squint, keep cutting.

## How positioning shows up everywhere

- Hero headline = value + best-fit customer.
- Sub-hero = unique attribute.
- Pricing page = customer + category.
- Cold emails = alternative + pain.
- Investor pitch = all five, in 90 seconds.

## When to revisit

Re-run this exercise every six months and every time your conversion rate suddenly drops. Positioning isn't set-and-forget — it's the foundation everything else sits on, and the ground keeps moving.`),
  },
  {
    slug: "the-landing-page-that-converts",
    title: "The Landing Page Structure That Converts",
    excerpt: "8 sections, in this order, every time.",
    readTime: "7 min",
    date: "2026-05-02",
    body: md(`# Landing Page Structure

There are roughly a thousand "landing page frameworks" online. Most of them are noise. After watching hundreds of indie launches, this is the eight-section structure that wins, in this order, every time.

## 1. Hero

- **Headline** — the value + audience. 7 words or fewer.
- **Sub-headline** — the mechanism. One sentence explaining *how*.
- **Primary CTA** — one button, verb-first ("Generate my brand").
- **Demo** — a 6-second silent loop or a single screenshot. No carousels.

If a visitor only reads this section, can they decide whether to keep scrolling? That's the test.

## 2. Social proof bar

Logos, user count, press mentions, or a single specific testimonial. Place it directly under the hero so it loads before the user starts to doubt.

## 3. Problem

Name the pain in the customer's own words. Bonus points for being a little funny. The reader should think: "wait, how do they know my exact frustration?"

## 4. Solution

One paragraph + one diagram or screenshot. This is where you connect the pain to your product. Keep it conceptual. Save feature details for the next section.

## 5. Features (3-6 max)

Each feature gets:
- A verb-first title ("Generate copy from your URL")
- One sentence of explanation
- One small visual

Don't list ten features. Pick the three that uniquely matter and let the rest live in /features or in docs.

## 6. Testimonials

Three is the magic number. Real names, real photos, real outcomes. One generic "great product!" tanks the credibility of the other two.

## 7. Pricing

Show the prices. Always. Hiding pricing behind "Contact us" loses 60% of bottom-of-funnel intent. Two or three tiers maximum. Highlight the middle one.

## 8. FAQ + final CTA

The FAQ is where you handle objections (refunds, security, "what if I'm not technical"). End with a single CTA that mirrors the hero button. Same words, same color.

## Bonus rules

- **One CTA color.** Repeat it. Don't introduce a new accent halfway down.
- **Mobile first, literally.** Design the mobile version before the desktop one.
- **One hero image, not a slider.** Sliders kill conversion every time.
- **Cut adjectives.** Twice.`),
  },
  {
    slug: "what-to-do-after-launch-day",
    title: "What To Do The Week After Launch Day",
    excerpt: "The post-launch dip is real. Here's how to keep momentum.",
    readTime: "6 min",
    date: "2026-04-29",
    body: md(`# After Launch Day

The post-launch dip is the silent killer of indie products. You spend two weeks on launch, you hit Top 5, you wake up Wednesday to half the traffic and a strange emptiness. Here's how to turn that single Tuesday into a six-week growth ramp.

## Day +1 — Thank you

- Public thank-you tweet with the final leaderboard screenshot.
- Personal email to every signup. Real name, two sentences, an actual question.
- Reply to every comment you missed yesterday.

## Day +2 — Numbers

- Post your honest day-1 numbers. Signups, revenue, conversion, bounce.
- Show the chart. People love seeing real-launch traffic shapes.
- This post often outperforms the launch tweet itself.

## Day +3 — Testimonials

- DM five users who replied positively and ask for one sentence of feedback you can quote.
- Add the three best to your landing page immediately.
- Update your X pinned tweet with one of them.

## Day +4 — Ship one improvement

- Pick the single most-requested fix from launch day.
- Ship it. Announce it as a small changelog post.
- Demonstrates momentum to the people who just signed up.

## Day +5 — Schedule the next launch

- Six weeks out. Mark the calendar.
- Decide the angle: new feature, new audience, new milestone.
- Tell three people the date so you can't quietly skip it.

## Day +6 — Compounding content

- Publish a retro blog post. Include numbers, mistakes, and one tactical insight.
- Submit it to Hacker News under "Show HN: Lessons from our PH launch."
- Cross-post on IndieHackers.

## Day +7 — Rest

- Genuinely off. Walk. Eat. Sleep. Talk to a human who doesn't know what SaaS is.
- The product will survive a day.

## What to avoid in the dip

- **Spamming "we're still on PH" tweets.** It looks desperate.
- **Discounting the day after launch.** Cheapens the product and angers Tuesday's buyers.
- **Pivoting based on three negative comments.** Wait two weeks.
- **Going dark.** The audience you just earned will forget you in 10 days if you do.

The launch isn't the win. The week after is.`),
  },
];

export const getArticle = (slug: string) => articles.find((a) => a.slug === slug);