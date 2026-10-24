import { describe, expect, it } from "vitest";
import { adminOverviewCsv } from "./adminOverviewCsv";

const loadedAt = "2026-10-18T03:00:00.000Z";
const exportedAt = "2026-10-18T03:01:00.000Z";

describe("admin overview CSV", () => {
  it("exports the six displayed stat groups with raw numbers, scopes and timestamps", () => {
    const csv = adminOverviewCsv({
      catalogue: { indexed: 6500 }, users: { members: 45, new_members: 2 },
      discovery: { saves: 0, searches: null }, funnel: { claims: 3 },
      attention: { failed_imports: 1 }, outreach: { sent: 12 },
      claims: [{ requester_email: "private@example.com" }],
    }, "7d", loadedAt, exportedAt);
    expect(csv).toContain('"Catalogue","indexed","6500","tracked","Current total","7d"');
    expect(csv).toContain('"People","new_members","2","tracked","Selected period"');
    expect(csv).toContain('"Discovery","saves","0","tracked"');
    expect(csv).toContain('"Discovery","searches","","not_tracked"');
    expect(csv).toContain('"Needs attention","failed_imports","1","tracked","Last 7 days"');
    expect(csv).toContain(`"Asia/Bangkok","${loadedAt}","${exportedAt}"`);
    expect(csv).not.toContain("private@example.com");
    expect(csv.split("\r\n")).toHaveLength(10);
  });

  it("escapes CSV text and keeps text inert in spreadsheet applications", () => {
    const csv = adminOverviewCsv({ catalogue: { 'name,"quoted"\nmetric': 1, '=HYPERLINK("bad")': 2 } }, "all", loadedAt, exportedAt);
    expect(csv).toContain('"name,""quoted""\nmetric"');
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  });
});

it("exports stored search and click numbers with the correct daily click scope", () => {
  const csv = adminOverviewCsv({discovery: {searches: 4, outbound_clicks: 65}}, "7d", loadedAt, exportedAt);
  expect(csv).toContain('"searches","4","tracked","Selected period","7d","Asia/Bangkok"');
  expect(csv).toContain('"outbound_clicks","65","tracked","Selected UTC calendar days (daily-deduplicated)","7d","UTC"');
});

it('exports growth counts as selected-period outcomes and events',()=>{
  const csv=adminOverviewCsv({growth:{activated_developers:2,verified_analytics_connections:3,share_actions:4,referral_registrations:1}},'7d',loadedAt,exportedAt);
  expect(csv).toContain('"Developer growth loop","activated_developers","2","tracked","Selected period"');
  expect(csv).toContain('"share_actions","4","tracked"');
});
