# Seller acquisition outreach: controlled A/B draft

Status: **prepared, not authorized to send**. Do not enqueue or email these messages until the owner approves the exact sample and copy. The current production outreach scheduler is active and must not be used as a test channel.

## Audience and readiness

- Start with existing reviewed, eligible developer contacts only. Exclude suppressed contacts, previous sends, current owners, bounced addresses, and contacts without valid invitation links.
- On 28 November 2026, 3,447 unique unsent reviewed contacts passed the preliminary eligibility checks, but **none had an unexpired invitation link**. Regenerate and recheck links through the existing controlled outreach process before any send.
- Pilot: 20 eligible contacts, randomized 1:1 by stable hash of the recipient ID and experiment ID `seller_2026_11_a`. Keep only one assignment per recipient. Respect the existing production hourly and daily limits and a holdout window of 7 days.
- No contact should receive both variants. Do not include private financial or valuation data in the messages or URLs.

## Variant A: claim your existing app

Subject: Claim your app on Rocket

Your app is already on Rocket. Claim it to manage the listing, add accurate details and verify your domain. Once verified, you can decide whether to make it available to buyers.

CTA: **Claim your app**. Use the existing recipient-specific invitation URL, with `utm_source=rocket_developer_outreach&utm_medium=email&utm_campaign=rocket_seller_claim_a` appended without changing its token.

## Variant B: discover value and sell

Subject: What could your app be worth?

Rocket lets you estimate your app's value and prepare a Marketplace listing. You can enter your details before signing up; domain verification and your explicit confirmation are required before a listing is public. An asking price is optional.

CTA: **Estimate and list your app**. Link to `https://tryrocket.ai/sell?utm_source=rocket_developer_outreach&utm_medium=email&utm_campaign=rocket_seller_valuation_b`. If the existing invitation token is needed for claim flow, preserve it in a separate approved link; do not put a token in general analytics.

## Measurement

Use distinct browser sessions for visits, valuation starts/completions, form starts/completions, signup starts/completions, restored drafts, ownership verification and listing publication. Attribute each stage by its original campaign where available. Match to recipient-level downstream outcomes only through the existing consented outreach record, never by putting an email or price in analytics events. Report both denominators: delivered messages and unique `/sell` visitors. Report unknown attribution separately from zero. Count public listings only after server-side publication succeeds.

Stop the pilot for unexpected bounces, complaints, unauthorized access, or attribution errors. Review results after seven days; do not scale based on opens alone.
