import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Users } from "lucide-react";
import PublicMetricCard, {
  publicTrafficValue,
  publicRevenueValue,
  revenueMoney,
} from "./PublicMetricCard";

it("makes shared counts the prominent card value", () => {
  const html = renderToStaticMarkup(
    <PublicMetricCard
      label="Daily active users"
      value={publicTrafficValue("exact", 4000, null)}
      icon={Users}
      details="Google Analytics · 2026-10-04"
    />,
  );
  expect(html).toContain("4K");
  expect(html).toContain("text-4xl");
  expect(html).toContain("Daily active users");
  expect(html).not.toContain("Updated");
});
it("does not reveal private, verified-only, or unknown visibility counts", () => {
  for (const visibility of ["private", "verified_only", "unexpected"]) {
    expect(publicTrafficValue(visibility, 4321, "4K–5K")).toBe("Private");
    expect(publicRevenueValue(visibility, 4000000, 100000, 200000, "usd")).toBe(
      "Private",
    );
  }
});
it("shows approved ranges without falling back to exact values", () => {
  expect(publicTrafficValue("range", 4321, "4K–5K")).toBe("4K–5K");
  expect(publicTrafficValue("range", 4321, null)).toBe("Private");
  expect(publicRevenueValue("range", 4000000, 100000, 200000, "usd")).toBe(
    "$1,000.00–$2,000.00",
  );
  expect(publicRevenueValue("range", 4000000, null, null, "usd")).toBe(
    "Private",
  );
});
it("formats revenue with currency-aware minor units and prominent compact amounts", () => {
  expect(revenueMoney(4000000, "usd")).toBe("$40K");
  expect(revenueMoney(1234, "usd")).toBe("$12.34");
  expect(revenueMoney(1234, "jpy")).toBe("¥1,234");
  expect(publicTrafficValue("exact", 0, null)).toBe("0");
  expect(publicRevenueValue("exact", 0, null, null, "usd")).toBe("$0.00");
});
