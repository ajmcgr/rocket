import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.ROCKET_SMOKE_BASE || 'http://127.0.0.1:5176';
const output = '/private/tmp/rocket-performance-smoke';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; const api = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() !== 'OPTIONS' && /\/rest\/v1\//.test(r.url())) api.push(r.url()); });
  await page.goto(`${base}/discover?view=all`);
  await page.locator('main a[href^="/apps/"]').first().waitFor();
  await page.waitForTimeout(1500);
  await page.locator('input[aria-label="Search apps"]').fill('Whisperit');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('main a[href="/apps/whisperit"]').first().waitFor();
  results.push({ check: 'Search real catalogue', passed: true });
  const before = api.length;
  await page.locator('main a[href="/apps/whisperit"]').first().click();
  await page.getByRole('heading', { name: 'Whisperit', exact: true, level: 1 }).waitFor();
  await page.getByRole('heading', { name: 'See Whisperit in action', exact: true }).waitFor();
  const html = await (await page.request.get(`${base}/apps/whisperit`)).text();
  if (!html.includes('https://tryrocket.ai/apps/whisperit') || !html.includes('og:title')) throw new Error('SSR metadata missing');
  results.push({ check: 'Profile identity/gallery + SSR canonical/Open Graph', passed: true });
  await page.goBack();
  await page.locator('main a[href="/apps/whisperit"]').first().waitFor();
  results.push({ check: 'Back preserves search', passed: new URL(page.url()).searchParams.get('q') === 'Whisperit', requestsDuringProfileAndBack: api.length - before });
  for (const path of ['/submit', '/login']) {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' }); await page.locator('h1, h2').first().waitFor();
    results.push({ check: path, passed: true });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/discover', '/apps/whisperit']) {
      await page.goto(`${base}${path}`);
      await page.locator(path.startsWith('/apps/') ? 'main h1' : 'main a[href^="/apps/"]').first().waitFor();
      await page.waitForTimeout(3000);
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      results.push({ check: `Layout ${width} ${path}`, passed: dimensions.content <= dimensions.viewport, ...dimensions });
      await page.screenshot({ path: `${output}/${width}-${path.replaceAll('/', '_')}-light.png` });
      await page.evaluate(() => { localStorage.setItem('theme', 'dark'); });
      await page.reload(); await page.waitForTimeout(2000);
      await page.screenshot({ path: `${output}/${width}-${path.replaceAll('/', '_')}-dark.png` });
      await page.evaluate(() => { localStorage.setItem('theme', 'light'); });
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ base, results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }));
} finally { await browser.close(); }
