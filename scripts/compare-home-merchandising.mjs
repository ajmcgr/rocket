import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  for (const [label, origin] of [
    ["baseline", "http://127.0.0.1:4183"],
    ["candidate", "http://127.0.0.1:4182"],
  ]) {
    for (let sample = 1; sample <= 2; sample++) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const requests = [];
      let imageBytes = 0,
        transferredBytes = 0;
      const images = new Set();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      cdp.on("Network.responseReceived", (e) => {
        if (e.type === "Image") images.add(e.requestId);
      });
      cdp.on("Network.loadingFinished", (e) => {
        transferredBytes += e.encodedDataLength;
        if (images.has(e.requestId)) imageBytes += e.encodedDataLength;
      });
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/")) requests.push(r.url());
      });
      await page.addInitScript(() => {
        window.__perf = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries())
            if (!e.hadRecentInput) window.__perf.cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(origin, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.locator("main article").first().waitFor({ timeout: 60000 });
      const catalogueVisibleMs = await page.evaluate(() => performance.now());
      await page.waitForTimeout(6000);
      console.log(
        JSON.stringify({
          label,
          sample,
          catalogueVisibleMs,
          browserRestRequests: requests.length,
          transferredBytes,
          imageBytes,
          ...(await page.evaluate(() => window.__perf)),
        }),
      );
      await page.close();
    }
  }
} finally {
  await browser.close();
}
