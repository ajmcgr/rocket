# Sell My App valuation methodology

Model version: 1.0.0. Amounts remain in the user's chosen USD, EUR or GBP currency; no conversion is performed.

The engine first selects **one** basis: positive monthly profit annualized, or recurring revenue annualized when profit is not supplied. MRR and ARR are never summed. A pre-revenue app, or a non-recurring app without profit, has no defensible dollar basis from these inputs and receives an insufficient-evidence result. Traffic alone has no monetary coefficient.

Profit basis starts at 3.0× annualized monthly profit. This illustrative anchor is between [Flippa's H1 2026 average SaaS annual-profit multiple of 2.47×](https://flippa.com/free-valuation/saas) and [Acquire.com's 2024–2025 median confirmed sale profit multiple of 3.9×](https://blog.acquire.com/acquire-com-biannual-acquisition-multiples-report-jan-2026/). Their populations are different, so neither is a forecast for an individual app. Recurring-revenue basis starts at a cautious 1.5× ARR when profit is missing. It has a wider uncertainty range.

The chosen multiple is adjusted once for monthly revenue growth (bounded ±18%), age (−20% under six months, −10% under 12, +8% from 36), churn (+5% below 3%, −12% at 7% or above), concentration (−12% at 40% or above), platform dependence (−8% if high), operational complexity (−8% if high), and organic acquisition (+4% for at least 60% organic share and 1,000 visits). The combined factor is clamped to 0.55–1.35. The profit range is midpoint ±30%; revenue range is midpoint ±40%. The bands are judgmental, not statistical confidence intervals.

Confidence is a completeness indicator, not a probability. All calculator inputs are manually entered, even if the user has a separate Rocket provider connection. No provider verification is claimed in saved results or shared cards. The model has no access to historical earnings volatility, customer cohort data, liabilities, transferability documents, or deal terms. A buyer's diligence may materially change the value. It is not a formal appraisal or guaranteed sale price.
