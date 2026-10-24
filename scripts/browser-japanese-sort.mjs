import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const base = process.env.BASE_URL;
if (process.env.VNCOLL_QA !== '1' || !base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Use VNCOLL_QA=1 and an explicitly isolated loopback BASE_URL');
}
const output = process.env.QA_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const ids = ['v95082', 'v95083', 'v95081'];
const labels = {
  en: { sort: 'Sort by', asc: 'Ascending', desc: 'Descending', wishlist: 'Sort' },
  fr: { sort: 'Trier par', asc: 'Tri ascendant', desc: 'Tri descendant', wishlist: 'Tri' },
  ja: { sort: '並び替え', asc: '昇順', desc: '降順', wishlist: '並び替え' },
};
async function hydrated(locator) {
  await locator.evaluate(async (element) => {
    const deadline = performance.now() + 20_000;
    while (!Object.keys(element).some((key) => key.startsWith('__reactProps$'))) {
      if (performance.now() > deadline) throw new Error('Control did not hydrate');
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
}
async function waitIds(page, expected) {
  await page.waitForFunction(async (values) => {
    for (let frame = 0; frame < 5; frame++) {
      const ids = [...new Set([...document.querySelectorAll('[data-vn-card] a[href^="/vn/"]')].map((link) => link.getAttribute('href').split('/').pop()))];
      if (JSON.stringify(ids) !== JSON.stringify(values)) return false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return true;
  }, expected);
}
async function settled(pending) {
  const deadline = Date.now() + 30_000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (pending.size === 0) return;
  } while (Date.now() < deadline);
  throw new Error('RSC navigation did not settle');
}
const results = [];
for (const [engine, browserType, viewport] of [['chromium', chromium, { width: 1366, height: 900 }], ['webkit', webkit, { width: 390, height: 844 }]]) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const locale of ['en', 'fr', 'ja']) {
      console.log(`Checking ${engine} ${locale}`);
      const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, ...(engine === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
      await context.addCookies([{ name: 'locale', value: locale, url: base }]);
      let page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const errors = [];
      const pendingRsc = new Set();
      page.on('request', (request) => { if (new URL(request.url()).searchParams.has('_rsc')) pendingRsc.add(request); });
      page.on('requestfinished', (request) => pendingRsc.delete(request));
      page.on('requestfailed', (request) => pendingRsc.delete(request));
      page.on('pageerror', (error) => errors.push(error.message));
      if (process.env.QA_DEBUG === '1') {
        page.on('console', (message) => { if (message.type() === 'error') console.log(message.text()); });
        page.on('pageerror', (error) => console.log(error.stack));
        page.on('response', (response) => { if (response.url().includes('_rsc=')) console.log(JSON.stringify({ status: response.status(), url: response.url(), location: response.headers().location })); });
      }
      await page.goto(`${base}/?q=Gojuon+QA&sort=title&order=asc`, { waitUntil: 'domcontentloaded' });
      await waitIds(page, [ids[2], ids[1], ids[0]]);
      await settled(pendingRsc);
      if (engine === 'webkit') {
        const trigger = page.locator('button[aria-expanded]').filter({ hasText: /Sort|Tri|並び替え/ });
        await trigger.first().click();
      }
      const sort = page.getByRole('combobox', { name: labels[locale].sort, exact: true }).filter({ visible: true }).first();
      await hydrated(sort);
      await sort.selectOption('title_kana');
      await page.waitForURL((url) => url.searchParams.get('sort') === 'title_kana');
      await waitIds(page, ids);
      await settled(pendingRsc);
      await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label]')].some((select) => select.value === 'title_kana'));
      await page.getByRole('button', { name: labels[locale].asc, exact: true }).filter({ visible: true }).first().click();
      await waitIds(page, [...ids].reverse());
      await settled(pendingRsc);
      await page.getByRole('button', { name: labels[locale].desc, exact: true }).filter({ visible: true }).first().click();
      await waitIds(page, ids);
      await settled(pendingRsc);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitIds(page, ids);
      console.log(`Library ${engine} ${locale} passed`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      page.removeAllListeners('pageerror');
      await page.close();
      page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/wishlist?sort=title_kana&hideOwned=0`, { waitUntil: 'domcontentloaded' });
      await waitIds(page, ids);
      const wishSort = page.getByRole('combobox', { name: labels[locale].wishlist, exact: true });
      await hydrated(wishSort);
      const reordered = page.waitForResponse((response) => response.url().includes('/api/wishlist?') && new URL(response.url()).searchParams.get('sort') === 'title_kana_desc');
      await wishSort.selectOption('title_kana_desc');
      await reordered;
      await waitIds(page, [...ids].reverse());
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitIds(page, [...ids].reverse());
      assert.equal(await wishSort.inputValue(), 'title_kana_desc');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      if (output) await page.screenshot({ path: path.join(output, `${engine}-${locale}-wishlist.png`), fullPage: true });
      results.push({ engine, locale, viewport, library: true, wishlist: true, reload: true, overflow: false, errors: errors.length });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(`Japanese ordering browser acceptance: ${results.length}/${results.length} passed`);
if (output) await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
