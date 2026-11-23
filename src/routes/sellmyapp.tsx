import { createFileRoute } from "@tanstack/react-router";
import { seoHead } from "@/lib/seoHead";
import SellMyApp from "@/pages/SellMyApp";

export const Route = createFileRoute("/sellmyapp")({
  head: () => ({
    ...seoHead("Sell My App | Free App Valuation Calculator | Rocket", "Find out what your app is worth. Estimate the market value of your SaaS, AI app or software business using revenue, growth and traffic.", "/sellmyapp"),
    scripts: [{ type: "application/ld+json", children: JSON.stringify({
      "@context": "https://schema.org", "@type": "WebApplication", name: "Sell My App by Rocket",
      description: "Free illustrative app valuation calculator", url: "https://tryrocket.ai/sellmyapp", applicationCategory: "FinanceApplication", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }) }],
  }),
  component: SellMyApp,
});
