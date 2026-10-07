// Local anonymous visual/layout smoke with browser-only GET fixtures.
// This does NOT replace production two-user authenticated acceptance.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const origin = process.env.COLLECTIONS_PREVIEW_URL || 'http://127.0.0.1:4175';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'Only an isolated local preview is allowed');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const fixture = { id: '30000000-0000-4000-8000-000000000001', name: 'Tools for independent builders', slug: 'builders-local-fixture', app_count: 2, username: 'fixture_curator', full_name: 'Local test curator', avatar_url: null, logos: [], updated_at: '2026-10-07T08:00:00Z' };
const apps = [1,2].map(i => ({id: `20000000-0000-4000-8000-00000000000${i}`, name: `Local fixture app ${i}`, slug: `local-fixture-${i}`, tagline: 'Useful independent software for thoughtful builders.', description: 'Fixture for isolated visual verification only.', website_url: 'https://example.com', canonical_host: 'example.com', logo_url: null, categories:['Productivity'], tags:[], platforms:['web'], launched_at:null,discovered_at:'2026-10-07T08:00:00Z',launch_url:null,claim_state:'unclaimed'}));
try {
  for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
    const page = await browser.newPage({ viewport });
    await page.route('https://lcujmvdgczkjxdstzhnr.supabase.co/rest/v1/**', async route => {
      assert.equal(route.request().method(), 'GET', 'Anonymous layout smoke must not write data');
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname.endsWith('/public_user_collections') ? [fixture] : pathname.endsWith('/collection_visible_apps') ? apps : [];
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(`${origin}/collections`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', {name:fixture.name}).waitFor();
    assert.ok(await page.getByRole('link', {name:/Tools for independent builders/}).count());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Collections discovery must not overflow');
    if (viewport.width < 1024) {
      const nav = page.getByRole('navigation', {name:'Mobile primary'});
      assert.ok(await nav.getByRole('link', {name:'Collections',exact:true}).isVisible());
      assert.ok(await nav.getByRole('link', {name:'My Collections',exact:true}).isVisible());
      assert.equal(await nav.getByRole('link').count(),6);
    }
    await page.getByRole('link', {name:/Tools for independent builders/}).click();
    await page.getByRole('heading',{name:fixture.name,level:1}).waitFor();
    await page.getByText('Local fixture app 1',{exact:true}).first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Manage collection'}).count(),0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'Collection detail must not overflow');
    await page.screenshot({path:`/private/tmp/rocket-collections-${viewport.width}.png`,fullPage:true});
    console.log(`PASS ${viewport.width}px public discovery/detail/nav layout (isolated GET fixtures)`);
    await page.close();
  }
  const response = await fetch(`${origin}/collections/not-a-public-collection`);
  const html = await response.text();
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.ok(html.includes('noindex, nofollow'));
  assert.ok(!html.includes(fixture.name));
  console.log('PASS actual local SSR missing/private metadata and no-store headers');
} finally { await browser.close(); }
