import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";
import SellMyApp from "@/pages/SellMyApp";

export const Route = createFileRoute("/sell")({
  head: () => ({
    ...seoHead("Sell My App | Rocket Marketplace", "List your software business on Rocket Marketplace. Verify your app, set an optional asking price, and get a free valuation estimate.", "/sell"),
    scripts: [{ type: "application/ld+json", children: JSON.stringify({
      "@context": "https://schema.org", "@type": "WebApplication", name: "Sell My App by Rocket",
      description: "Free illustrative app valuation calculator", url: "https://tryrocket.ai/sell", applicationCategory: "FinanceApplication", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }) }],
  }),
  component: SellMyApp,
});
