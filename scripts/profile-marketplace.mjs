import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Isolated, read-only browser audit. No user profile, credentials, payments,
// saves, submissions, or admin actions. Request headers/bodies are not stored.
const base = process.env.ROCKET_PROFILE_BASE || 'https://tryrocket.ai';
const output = resolve(process.env.ROCKET_PROFILE_OUTPUT || '/private/tmp/rocket-performance-baseline');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const width of (process.env.ROCKET_PROFILE_WIDTHS || '1440,390').split(',').map(Number)) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable'); await session.send('Performance.enable');
    if (width === 390) {
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await session.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
    }
    await page.addInitScript(() => {
      window.__rocketProfile = { lcp: null, cls: 0, longTasks: 0, maxEvent: null };
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__rocketProfile.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__rocketProfile.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__rocketProfile.longTasks += e.duration; }).observe({ type: 'longtask', buffered: true });
    });
    for (const path of (process.env.ROCKET_PROFILE_PATHS || '/,/discover,/apps/whisperit,/submit,/your-apps,/developer,/create,/admin').split(',')) {
      // Private routes are measured only as anonymous gates, never as owners/admins.
      for (const temperature of ['cold', 'warm']) {
        const requests = new Map(); const finished = []; const errors = [];
        const started = e => requests.set(e.requestId, { url: e.request.url, method: e.request.method, type: e.type, start: e.timestamp });
        const response = e => { const entry = requests.get(e.requestId); if (entry) Object.assign(entry, { status: e.response.status, mime: e.response.mimeType, cache: !!e.response.fromDiskCache }); };
        const done = e => { const entry = requests.get(e.requestId); if (entry) finished.push({ ...entry, encodedBytes: e.encodedDataLength, durationMs: (e.timestamp - entry.start) * 1000 }); };
        const failed = e => errors.push({ url: requests.get(e.requestId)?.url, error: e.errorText });
        session.on('Network.requestWillBeSent', started); session.on('Network.responseReceived', response); session.on('Network.loadingFinished', done); session.on('Network.loadingFailed', failed);
        await session.send('Network.setCacheDisabled', { cacheDisabled: temperature === 'cold' });
        const begin = Date.now(); let usefulMs = null; let failure = null;
        try {
          await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          const selector = path === '/' || path === '/discover' ? 'main a[href^="/apps/"]' : path.startsWith('/apps/') ? 'main h1' : 'h1, h2';
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 45000 });
          usefulMs = Date.now() - begin;
          await page.waitForTimeout(5000); // Fixed observation window, identical before/after.
        } catch (error) { failure = error.message.split('\n')[0]; }
        const metrics = await page.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource');
          return { ttfbMs: n?.responseStart, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
            ...window.__rocketProfile, resources: resources.map(r => ({ url: r.name, type: r.initiatorType, durationMs: r.duration, decodedBytes: r.decodedBodySize })),
            width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            heading: document.querySelector('h1')?.textContent, url: location.pathname };
        }).catch(() => ({}));
        const totals = type => finished.filter(r => r.type === type).reduce((n, r) => n + r.encodedBytes, 0);
        const api = finished.filter(r => r.method !== 'OPTIONS' && /\/rest\/v1\/|\/functions\/v1\//.test(r.url));
        const duplicateCounts = new Map(); for (const r of api) duplicateCounts.set(r.url, (duplicateCounts.get(r.url) || 0) + 1);
        const result = { path, temperature, width, usefulMs, failure, ...metrics, jsTransferBytes: totals('Script'), imageTransferBytes: totals('Image'),
          apiRequests: api.length, apiTransferBytes: api.reduce((n, r) => n + r.encodedBytes, 0),
          duplicateRequests: [...duplicateCounts].filter(([, n]) => n > 1), slowest: [...finished].sort((a,b) => b.durationMs - a.durationMs).slice(0,8), requests: finished, errors };
        results.push(result);
        await page.screenshot({ path: `${output}/${width}-${path.replaceAll('/', '_') || 'home'}-${temperature}.png`, fullPage: false }).catch(() => undefined);
        console.log(JSON.stringify({ path, temperature, width, usefulMs, failure, ttfbMs: result.ttfbMs, fcpMs: result.fcpMs, lcpMs: result.lcp, cls: result.cls, jsTransferBytes: result.jsTransferBytes, apiRequests: result.apiRequests, apiTransferBytes: result.apiTransferBytes, imageTransferBytes: result.imageTransferBytes }));
        session.off('Network.requestWillBeSent', started); session.off('Network.responseReceived', response); session.off('Network.loadingFinished', done); session.off('Network.loadingFailed', failed);
        await writeFile(`${output}/measurements.json`, JSON.stringify({ base, observedAt: new Date().toISOString(), methodology: 'Isolated anonymous Chrome; desktop unthrottled, mobile 4x CPU/1.6Mbps/100ms RTT. Cold HTTP cache disabled, warm reload cache enabled. LCP/CLS observed 5s after useful content. INP and JS parsed are not claimed from a navigation-only audit. Private routes are anonymous gates only.', results }, null, 2));
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
