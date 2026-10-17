import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [375,390,430]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({body:'Fixture checkout — no payment',contentType:'text/html'}));
  await page.goto('http://127.0.0.1:5178/tests/commerce/preview.html');
  await page.getByRole('heading',{name:'Example app',exact:true}).waitFor();
  await page.getByRole('button',{name:'Buy with Rocket',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Buy with Rocket',exact:true}).count(),1);
  await page.getByRole('button',{name:'Buy with Rocket',exact:true}).isDisabled().then(assert.ok);
  await page.getByRole('radio').filter({hasText:'Pro'}).click();
  await page.getByRole('button',{name:'Annual',exact:true}).click();
  await page.getByRole('radio').filter({hasText:'$210.00/year'}).getAttribute('aria-checked').then(value=>assert.equal(value,'true'));
  assert.ok(await page.getByRole('link',{name:'Visit website'}).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:`/tmp/rocket-multi-plan-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Buy with Rocket',exact:true}).click();
  await page.waitForURL('https://checkout.stripe.com/fixture?offer=55555555-5555-4555-8555-555555555555');
  console.log(`${width}px: cards, actual annual price, selection, single CTA, website link, no overflow, checkout redirect PASS`);
  await page.close();
 }
 const page=await browser.newPage();
 await page.route('https://tryrocket.ai/apps/**',route=>route.fulfill({body:'Hosted picker fixture',contentType:'text/html'}));
 await page.goto('http://127.0.0.1:5178/tests/commerce/preview.html');
 await page.evaluate(()=>{const button=document.createElement('rocket-button');button.setAttribute('action','buy');button.setAttribute('app-id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');button.setAttribute('offer-id','44444444-4444-4444-8444-444444444444');document.getElementById('external').append(button);});
 await page.locator('#external').getByRole('button',{name:'Buy with Rocket'}).click();
 await page.waitForURL('https://tryrocket.ai/apps/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?buy=1&source=developer_website&offer=44444444-4444-4444-8444-444444444444#pricing');
 console.log('External official button → exact hosted app/offer/source PASS');
} finally {await browser.close();}
