export type MarketplaceComparison = {
  slug: string;
  name: string;
  focus: string;
  summary: string;
  chooseThem: string;
  chooseRocket: string;
  sourceUrl: string;
  sourceLabel: string;
};

// Narrow descriptions sourced from each platform's own documentation.
export const marketplaceComparisons: MarketplaceComparison[] = [
  {
    slug: "app-store",
    name: "App Store",
    focus: "Apps for Apple devices",
    summary: "Apple's App Store helps people discover and download apps and games for Apple devices, with editorial collections, ratings, and reviews.",
    chooseThem: "You want to find and download an app for an Apple device, with the App Store's native installation and purchase experience.",
    chooseRocket: "You want to explore independent web apps across the open web, including apps that do not require an App Store download.",
    sourceUrl: "https://www.apple.com/app-store/",
    sourceLabel: "Apple: App Store",
  },
  {
    slug: "google-play",
    name: "Google Play",
    focus: "Apps for Android devices",
    summary: "Google Play helps people discover and install Android apps and games, with categories, ratings, and reviews.",
    chooseThem: "You want to find and install an Android app through Google Play.",
    chooseRocket: "You want to browse and save independent web apps, including software accessed directly through a website.",
    sourceUrl: "https://play.google.com/store/apps/category/APPLICATION",
    sourceLabel: "Google Play: Apps",
  },
  {
    slug: "product-hunt",
    name: "Product Hunt",
    focus: "Daily community launches",
    summary: "Product Hunt highlights new products through launches and a community-ranked daily feed.",
    chooseThem: "You want a launch-day audience, maker conversation, and a daily leaderboard.",
    chooseRocket: "You want to browse independent web apps by category, inspect a persistent app profile, and save apps to revisit.",
    sourceUrl: "https://www.producthunt.com/about",
    sourceLabel: "Product Hunt: About",
  },
  {
    slug: "whop",
    name: "Whop",
    focus: "Selling digital products and memberships",
    summary: "Whop combines storefronts, payments, and discovery for digital businesses and creators.",
    chooseThem: "You want to buy or sell within Whop's commerce and community ecosystem.",
    chooseRocket: "You want to discover independent apps across the open web, including apps that are not sold through Rocket.",
    sourceUrl: "https://marketing.core.whop.com/",
    sourceLabel: "Whop: Platform overview",
  },
  {
    slug: "gumroad",
    name: "Gumroad",
    focus: "Creator storefronts and digital products",
    summary: "Gumroad lets creators sell products and memberships, while Discover recommends eligible products.",
    chooseThem: "You want a creator storefront or to purchase a digital download or membership.",
    chooseRocket: "You want an app-focused catalogue with search, categories, app profiles, and a saved-app list.",
    sourceUrl: "https://gumroad.com/help/article/79-gumroad-discover",
    sourceLabel: "Gumroad: Discover",
  },
  {
    slug: "g2",
    name: "G2",
    focus: "B2B software research and reviews",
    summary: "G2 helps business buyers research software using user reviews and side-by-side comparisons.",
    chooseThem: "You need review-led B2B evaluation and side-by-side product research.",
    chooseRocket: "You want a simpler place to explore independent apps and follow new or rising launches. Rocket does not claim G2's review depth.",
    sourceUrl: "https://www.g2.com/compare",
    sourceLabel: "G2: Compare software",
  },
];

export const getMarketplaceComparison = (slug: string) =>
  marketplaceComparisons.find((item) => item.slug === slug);
