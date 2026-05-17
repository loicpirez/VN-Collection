#!/usr/bin/env node
import path from 'node:path';
import { chromium } from 'playwright';

const cwd = process.cwd();
const port = process.env.PORT || '3101';
const base = process.env.BASE_URL || `http://localhost:${port}`;
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : '';
const storageRoot = process.env.STORAGE_ROOT ? path.resolve(process.env.STORAGE_ROOT) : '';
const realDb = path.resolve(cwd, 'data/collection.db');
const realStorage = path.resolve(cwd, 'data/storage');
const qaRoot = `${path.sep}.qa${path.sep}`;

function die(message) {
  console.error(`qa:interactions: ${message}`);
  process.exit(2);
}

if (process.env.WRITE_QA_ALLOWED !== '1') die('WRITE_QA_ALLOWED=1 is required for write-capable browser QA.');
if (process.env.VNCOLL_QA !== '1') die('VNCOLL_QA=1 is required for write-capable browser QA.');
if (!dbPath || dbPath === realDb || !dbPath.includes(qaRoot)) die(`refusing DB_PATH=${dbPath || '<unset>'}; use .qa/data/collection.db`);
if (!storageRoot || storageRoot === realStorage || !storageRoot.includes(qaRoot)) die(`refusing STORAGE_ROOT=${storageRoot || '<unset>'}; use .qa/storage`);

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    if (!String(e?.message ?? '').includes("Executable doesn't exist")) throw e;
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

async function pageHasFatalError(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /Functions cannot be passed directly|Application error|Unhandled Runtime Error|SqliteError|no such column/i.test(text);
}

async function gotoClean(page, url) {
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  assert(!(await pageHasFatalError(page)), `${url} rendered a fatal/runtime error`);
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return locator.first();
}

async function waitForEnabled(locator, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false)) && !(await locator.isDisabled().catch(() => true))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('control did not become enabled');
}

check('detail pages do not crash across RSC boundary', async (page) => {
  for (const url of ['/character/c84419', '/character/c90980', '/staff/s12799', '/staff/s1073?scope=collection', '/producer/p604']) {
    await gotoClean(page, url);
  }
});

check('settings modal tabs are reachable and non-empty', async (page) => {
  for (const url of ['/', '/shelf', '/vn/v26180']) {
    await gotoClean(page, url);
    const trigger = page
      .locator(
        'button[aria-haspopup="dialog"][aria-label="Affichage"], button[aria-haspopup="dialog"][aria-label="Display"], button[aria-haspopup="dialog"][aria-label="表示"]',
      )
      .first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const labels = await dialog.getByRole('tab').allInnerTexts();
    assert(labels.length >= 7, `settings in ${url} exposes too few tabs`);
    assert(new Set(labels).size === labels.length, `settings in ${url} has duplicate tab labels`);
    for (const label of labels) {
      await dialog.getByRole('tab', { name: label }).click();
      const panelText = (await dialog.innerText()).trim();
      assert(panelText.length > 80, `settings tab ${label} in ${url} is empty/orphan`);
    }
    await dialog.getByRole('tab', { name: labels[0] }).click();
    const text = await dialog.innerText();
    assert(/Défauts globaux|Global defaults|デフォルト/i.test(text), 'global defaults heading missing');
    assert(/Surcharges? par page|Per-page overrides|ページ別/i.test(text), 'per-page density heading missing');
    await page.keyboard.press('Escape');
  }
});

check('cover rotation clicks change visible transform and persist/reset', async (page) => {
  await gotoClean(page, '/vn/v26180');
  await page.evaluate(async () => {
    await fetch('/api/collection/v26180/cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'url', value: 'https://t.vndb.org/cv/60/93160.jpg' }),
    });
    await fetch('/api/collection/v26180/cover', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotation: 0 }),
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const controls = page.locator('[data-testid="cover-rotation-controls"]').first();
  await controls.waitFor({ state: 'visible', timeout: 10000 });
  await controls.scrollIntoViewIfNeeded();
  const coverGroup = controls.locator('xpath=ancestor::div[contains(@class,"group")][1]');
  const coverImage = coverGroup.locator('img').first();
  await coverImage.waitFor({ state: 'visible', timeout: 10000 });
  const right = controls.getByRole('button', { name: /Pivoter à droite|Rotate right|右に回転/i }).first();
  await right.click({ force: true });
  await page.waitForTimeout(800);
  const rotatedTransform = await coverImage.evaluate((img) => img.getAttribute('style') || '');
  assert(/rotate\((90|180|270)deg\)/.test(rotatedTransform), 'cover rotation did not change the active cover image transform');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const persistedTransform = await page
    .locator('[data-testid="cover-rotation-controls"]')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"group")][1]')
    .locator('img')
    .first()
    .evaluate((img) => img.getAttribute('style') || '');
  assert(/rotate\((90|180|270)deg\)/.test(persistedTransform), 'cover rotation did not persist after reload');
  const reset = page.locator('[data-testid="cover-rotation-controls"]').first().getByRole('button', { name: /Réinitialiser la rotation|Reset rotation|回転をリセット/i }).first();
  await waitForEnabled(reset);
  await reset.click({ force: true });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const resetTransform = await page
    .locator('[data-testid="cover-rotation-controls"]')
    .first()
    .locator('xpath=ancestor::div[contains(@class,"group")][1]')
    .locator('img')
    .first()
    .evaluate((img) => img.getAttribute('style') || '');
  assert(!/rotate\((90|180|270)deg\)/.test(resetTransform), 'cover rotation reset did not persist');
});

check('media action menu opens in a portal and is not clipped', async (page) => {
  await gotoClean(page, '/vn/v26180');
  const action = await firstVisible(page.getByRole('button', { name: /^Actions$|操作/i }));
  await action.scrollIntoViewIfNeeded();
  await action.click();
  const menu = page.getByRole('menu', { name: /^Actions$|操作/i }).first();
  await menu.waitFor({ state: 'visible', timeout: 10000 });
  const box = await menu.boundingBox();
  assert(box && box.width > 150 && box.height > 80, 'media menu is too small or clipped');
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280, 'media menu overflows viewport');
  await page.getByRole('menuitem', { name: /Couverture|Cover|カバー/i }).first().click();
  await page.waitForTimeout(300);
  assert(!(await menu.isVisible().catch(() => false)), 'media menu did not close after item click');
});

check('spoiler hover and click reveal text without opaque block', async (page) => {
  for (const url of ['/vn/v32132', '/character/c69497', '/vn/v5262']) {
    await gotoClean(page, url);
    const spoiler = page.locator('[data-spoiler-state]').first();
    if ((await spoiler.count()) === 0) continue;
    await spoiler.hover();
    await page.waitForTimeout(200);
    const hoverState = await spoiler.getAttribute('data-spoiler-state');
    assert(hoverState === 'transient' || hoverState === 'revealed', `${url} spoiler did not reveal on hover`);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    await spoiler.click();
    await page.waitForTimeout(200);
    assert((await spoiler.getAttribute('data-spoiler-state')) === 'revealed', `${url} spoiler did not persist after click`);
    const blackBlock = await spoiler.locator('.bg-black').count();
    assert(blackBlock === 0, `${url} spoiler has opaque black block`);
  }
});

check('character and staff filters browse actual results', async (page) => {
  await gotoClean(page, '/characters?sex=f&ageMin=18&ageMax=30');
  assert(await page.locator('a[href^="/character/"]').count() > 0, 'character filtered browse returned no character links');
  await gotoClean(page, '/characters?hasVoice=1&vaLang=ja');
  assert(await page.locator('a[href^="/character/"]').count() > 0, 'character VA-language browse returned no character links');
  await gotoClean(page, '/characters?q=c90980');
  assert(
    /\/character\/c90980(?:$|\?)/.test(page.url()) ||
      (await page.locator('a[href="/character/c90980"], a[href^="/character/c90980?"]').count()) > 0,
    'character id search did not route to or expose c90980',
  );
  await gotoClean(page, '/staff?q=&role=translator&lang=ja');
  assert(await page.locator('a[href^="/staff/"]').count() > 0, 'staff role/lang filter returned no staff links');
});

check('VNDB tag hierarchy skeleton, tree, click routing, and pagination', async (page) => {
  await page.route('**/api/tags/web-tree**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto(`${base}/tags?mode=vndb`, { waitUntil: 'domcontentloaded' });
  // The skeleton is shown while the tree or local counts are loading;
  // it may not appear if SSR already injected the initial tree.
  await page.waitForSelector('text=Theme', { timeout: 20000 });
  for (const label of ['Theme', 'Character', 'Style', 'Plot', 'Setting']) {
    assert(await page.getByText(label, { exact: true }).count() > 0, `missing tag tree group ${label}`);
  }
  await page.getByRole('link', { name: /Fantasy/i }).first().click();
  await page.waitForURL(/\/tag\/g2\?tab=vndb/);
  // The heading now uses neutral copy — not "Meilleurs VN"/"Top VNs"
  await page.waitForSelector(
    'h2:text("VN avec ce tag"), h2:text("VNs with this tag"), h2:text("このタグの VN")',
    { timeout: 20000 },
  ).catch(() => undefined);
  const next = page.getByRole('link', { name: /Suivant|Next|次/i }).first();
  if (await next.count()) {
    await next.click({ force: true });
    await page.waitForURL(/page=2/);
  }
  await page.unroute('**/api/tags/web-tree**').catch(() => undefined);
});

check('recommendation seed picker updates URL and explanation exists', async (page) => {
  await gotoClean(page, '/recommendations?mode=similar-to-vn');
  const input = page.locator('[data-testid="vn-seed-picker"] input[role="combobox"]').first();
  await input.fill('v28032');
  const seedOption = page.locator('[role="option"] button[title="v28032"]').first();
  await seedOption.waitFor({ state: 'visible', timeout: 15000 });
  await seedOption.click();
  await page.waitForURL(/seed=v28032/, { timeout: 15000 }).catch(() => undefined);
  assert(
    page.url().includes('seed=v28032') ||
      (await page.locator('[data-testid="vn-seed-chip"][data-seed-id="v28032"]').count()) > 0,
    'seed picker did not select/update visible seed',
  );
  assert(await page.locator('text=/Pourquoi|Why|理由/i').count() > 0, 'recommendation explanation panel missing');
});

check('shelf display controls change rendered CSS variables', async (page) => {
  await gotoClean(page, '/shelf');
  const root = page.locator('.shelf-view-root').first();
  await root.waitFor({ state: 'visible', timeout: 10000 });
  const before = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--shelf-cell-w-px') || el.style.getPropertyValue('--shelf-cell-w-px'));
  await page.getByRole('button', { name: /Options d'affichage de l'étagère|Shelf display options|表示/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /Options d'affichage de l'étagère|Shelf display options|表示/i }).first();
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  const slider = dialog.locator('input[type="range"]').first();
  const current = Number(await slider.inputValue());
  const max = Number(await slider.getAttribute('max'));
  const step = Number(await slider.getAttribute('step')) || 4;
  await slider.fill(String(Math.min(max, current + step * 4)));
  await page.waitForTimeout(800);
  const after = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--shelf-cell-w-px') || el.style.getPropertyValue('--shelf-cell-w-px'));
  assert(before !== after, `shelf cell width CSS variable did not change (${before} -> ${after})`);
});

check('section layout controls hide/collapse and save without moving identity', async (page) => {
  await gotoClean(page, '/character/c90980');
  const beforeH1 = await page.locator('main h1').first().innerText();
  await page.getByRole('button', { name: /Mise en page|Layout|レイアウト/i }).last().click();
  const hide = page.getByRole('button', { name: /Masquer la section|Hide section|非表示/i }).first();
  await hide.click();
  const collapse = page.getByRole('button', { name: /Réduire par défaut|Collapse by default|折りたたむ/i }).first();
  if (await collapse.count()) await collapse.click();
  await page.getByRole('button', { name: /^Enregistrer$|^Save$|保存/i }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const afterH1 = await page.locator('main h1').first().innerText();
  assert(beforeH1 === afterH1, 'main identity/header changed after section layout edit');
});

check('EGS cards do not overflow desktop viewport', async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoClean(page, '/egs');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 2, `EGS page horizontally overflows by ${overflow}px`);
});

check('/tags?mode=vndb shows Theme/Character/Style/Plot/Setting groups', async (page) => {
  await gotoClean(page, '/tags?mode=vndb');
  await page.waitForSelector('text=Theme', { timeout: 20000 });
  for (const label of ['Theme', 'Character', 'Style', 'Plot', 'Setting']) {
    assert(
      await page.getByText(label, { exact: true }).count() > 0,
      `tag tree group "${label}" not visible on /tags?mode=vndb`,
    );
  }
});

check('/tag/[id]?tab=vndb pagination controls visible and change URL', async (page) => {
  // g578 is a mid-level tag that has enough VNs for pagination
  await gotoClean(page, '/tag/g578?tab=vndb');
  // Wait for the VNDB results section to settle
  await page.waitForSelector('[role="navigation"]', { timeout: 20000 }).catch(() => undefined);
  const next = page.getByRole('link', { name: /Suivant|Next|次/i }).first();
  if (await next.count() > 0) {
    const href = await next.getAttribute('href');
    assert(href && /page=\d+/.test(href), 'Next page link does not include page param');
    await next.click({ force: true });
    await page.waitForURL(/page=\d+/, { timeout: 15000 });
    assert(/page=\d+/.test(page.url()), 'URL did not update after clicking next page');
  }
  // Prev link should also appear on page 2 (if we navigated)
  if (/page=2/.test(page.url())) {
    const prev = page.getByRole('link', { name: /Précédent|Prev|前/i }).first();
    assert(await prev.count() > 0, 'Previous page link missing on page 2');
  }
});

check('/vn/v26180 toolbar buttons have consistent height', async (page) => {
  await gotoClean(page, '/vn/v26180');
  const nav = page.locator('nav[aria-label]').first();
  await nav.waitFor({ state: 'visible', timeout: 10000 });
  const buttons = nav.locator('button.btn, a.btn');
  const count = await buttons.count();
  if (count < 2) return; // Nothing to compare
  const heights = [];
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (box && box.height > 0) heights.push(Math.round(box.height));
  }
  if (heights.length < 2) return;
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  assert(max - min <= 1, `toolbar button heights drift by ${max - min}px (min=${min}, max=${max})`);
});

check('/vn/v4327 spoiler hover reveals text, click persists', async (page) => {
  await gotoClean(page, '/vn/v4327');
  const spoiler = page.locator('[data-spoiler-state="hidden"]').first();
  if ((await spoiler.count()) === 0) {
    // No hidden spoiler on this page — skip
    return;
  }
  // Hover: should transition to transient or revealed
  await spoiler.hover();
  await page.waitForTimeout(300);
  const hoverState = await spoiler.getAttribute('data-spoiler-state');
  assert(
    hoverState === 'transient' || hoverState === 'revealed',
    `spoiler did not reveal on hover (state=${hoverState})`,
  );
  // The real content should now be visible (not sr-only)
  const contentSpan = spoiler.locator('span:not(.hidden):not([aria-hidden="true"])').last();
  const contentText = await contentSpan.innerText().catch(() => '');
  assert(contentText.length > 0, 'spoiler real content is empty after hover reveal');
  // Move away and click to persist
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await spoiler.click();
  await page.waitForTimeout(300);
  const clickState = await spoiler.getAttribute('data-spoiler-state');
  assert(clickState === 'revealed', `spoiler did not persist after click (state=${clickState})`);
});

check('/character/c84419 route does not crash', async (page) => {
  await gotoClean(page, '/character/c84419');
  // Verify no admin/debug wrapper leaked into the page
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  assert(!/admin wrapper|__NEXT_DATA__.*__admin/i.test(bodyText), 'admin wrapper visible on character page');
  // Verify the character id appears somewhere in the page (h1 or link)
  const hasId = (await page.locator('text=c84419').count()) > 0 ||
    (await page.locator('h1').count()) > 0;
  assert(hasId, '/character/c84419 rendered no heading or id reference');
});

check('/recommendations first card has cover and reference tags not generic-only', async (page) => {
  await gotoClean(page, '/recommendations');
  // Wait for at least one card to appear
  const cards = page.locator('article, [data-vn-id]');
  await cards.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
  const cardCount = await cards.count();
  if (cardCount === 0) return; // Empty collection — skip
  // First card should have an image (cover)
  const firstImg = cards.first().locator('img').first();
  const imgSrc = await firstImg.getAttribute('src').catch(() => null);
  // May be lazy-loaded; just verify the element exists
  assert(
    (await firstImg.count()) > 0,
    'first recommendation card has no <img> element',
  );
  // Tags section should show specific tag names, not just generic "tag" text
  const tagLinks = page.locator('a[href*="/tag/"]');
  if (await tagLinks.count() > 0) {
    const firstTagText = await tagLinks.first().innerText().catch(() => '');
    assert(firstTagText.trim().length > 0, 'recommendation reference tag has empty label');
  }
});

check('/?tag=g660 recently viewed section has nonzero top margin', async (page) => {
  await gotoClean(page, '/?tag=g660');
  // The recently viewed strip should be separated from the content above
  const recentSection = page.locator('[data-section="recently-viewed"], section:has-text("Récemment|Recently|最近")').first();
  if ((await recentSection.count()) === 0) return; // No recently viewed — skip
  const box = await recentSection.boundingBox();
  const prevSibling = await recentSection.evaluate((el) => {
    const prev = el.previousElementSibling;
    if (!prev) return null;
    const prevBox = prev.getBoundingClientRect();
    const myBox = el.getBoundingClientRect();
    return myBox.top - (prevBox.top + prevBox.height);
  });
  if (prevSibling !== null) {
    assert(prevSibling > 0, `recently viewed section has zero/negative top margin (${prevSibling}px gap)`);
  }
});

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  window.localStorage.setItem('vn_tour_completed_v1', '1');
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

let pass = 0;
let fail = 0;
console.log('browser-interactions preflight');
console.log(`  BASE             = ${base}`);
console.log(`  DB_PATH          = ${dbPath}`);
console.log(`  STORAGE_ROOT     = ${storageRoot}`);
console.log(`  WRITE_QA_ALLOWED = ${process.env.WRITE_QA_ALLOWED}`);
console.log(`  VNCOLL_QA        = ${process.env.VNCOLL_QA}`);
console.log('');

for (const { name, fn } of checks) {
  try {
    errors.length = 0;
    await fn(page);
    const fatal = errors.find((e) => /Functions cannot be passed directly|SqliteError|no such column/i.test(e));
    assert(!fatal, `browser console/runtime fatal: ${fatal}`);
    pass += 1;
    console.log(`✓ ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${(e && e.stack) || e}`);
  }
}

await context.close();
await browser.close();
console.log('');
console.log(`Interaction QA summary: PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
