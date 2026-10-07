import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Anonymous real-public-data checks. No credentials, writes or invented fixtures.
const origin = process.env.HOME_PREVIEW_URL || "http://127.0.0.1:4182";
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const html = await (await fetch(origin)).text();
  assert.ok(
    html.includes("Rising on Rocket") && html.includes("Top Apps"),
    "Public shelves must be server-rendered",
  );
  for (const width of [320, 375, 390, 430, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 1440 ? 1000 : 844 },
    });
    const rest = [];
    const errors = [];
    let imageBytes = 0;
    const cdp = await page.context().newCDPSession(page);
    const images = new Set();
    await cdp.send("Network.enable");
    cdp.on("Network.responseReceived", (event) => {
      if (event.type === "Image") images.add(event.requestId);
    });
    cdp.on("Network.loadingFinished", (event) => {
      if (images.has(event.requestId)) imageBytes += event.encodedDataLength;
    });
    page.on("request", (request) => {
      if (request.url().includes("/rest/v1/")) rest.push(request.url());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__homePerf = { lcp: 0, cls: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__homePerf.lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          if (!e.hadRecentInput) window.__homePerf.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page
      .getByRole("heading", { name: "Top Apps", exact: true })
      .waitFor();
    await page.waitForTimeout(3000);
    const headings = await page.locator("main h2").allTextContents();
    assert.ok(
      headings.indexOf("Rising on Rocket") < headings.indexOf("Top Apps"),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${width}px overflow`,
    );
    assert.ok(
      !rest.some((url) =>
        /saved_apps|marketplace_follows|notifications|connect_transactions/.test(
          url,
        ),
      ),
      "Anonymous homepage must not query private state",
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.equal(
      await page
        .getByRole("heading", { name: "Proven Traction", exact: true })
        .count(),
      0,
      "Insufficient current production evidence",
    );
    await page.screenshot({
      path: `/private/tmp/rocket-home-${width}.png`,
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        width,
        headings,
        browserRestRequests: rest.length,
        imageBytes,
        ...(await page.evaluate(() => window.__homePerf)),
      }),
    );
    await page.close();
  }
  for (const path of ["/rising", "/picks"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    console.log(`PASS destination ${path}`);
  }
} finally {
  await browser.close();
}
