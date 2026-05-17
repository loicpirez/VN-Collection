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

check('detail pages do not crash across RSC boundary', async (page) => {
  for (const url of ['/character/c84419', '/character/c90980', '/staff/s12799', '/staff/s1073?scope=collection', '/producer/p604']) {
    await gotoClean(page, url);
  }
});

check('settings modal tabs are reachable and non-empty', async (page) => {
  for (const url of ['/', '/shelf', '/vn/v26180']) {
    await gotoClean(page, url);
    const trigger = page.getByRole('button', { name: /Réglages|Settings|設定/i }).first();
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
    const text = await dialog.innerText();
    assert(/Défauts globaux|Global defaults|デフォルト/.test(text), 'global defaults heading missing');
    assert(/Surcharge par page|Per-page overrides|ページ別/.test(text), 'per-page density heading missing');
    await page.keyboard.press('Escape');
  }
});

check('cover rotation clicks change visible transform and persist/reset', async (page) => {
  await gotoClean(page, '/vn/v26180');
  const right = page.getByRole('button', { name: /Pivoter à droite|Rotate right|右に回転/i }).first();
  await right.click({ force: true });
  await page.waitForTimeout(800);
  const rotated = await page.locator('main img[style*="rotate(90deg)"], main img[style*="rotate(270deg)"], main img[style*="rotate(180deg)"]').count();
  assert(rotated > 0, 'cover rotation did not change an image transform');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const persisted = await page.locator('main img[style*="rotate("]').count();
  assert(persisted > 0, 'cover rotation did not persist after reload');
  const reset = page.getByRole('button', { name: /Réinitialiser la rotation|Reset rotation|回転をリセット/i }).first();
  await reset.click({ force: true });
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  const stillRotated = await page.locator('main img[style*="rotate("]').count();
  assert(stillRotated === 0, 'cover rotation reset did not persist');
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
  assert(await page.locator('a[href="/character/c90980"], a[href^="/character/c90980?"]').count() > 0, 'character id search did not expose c90980');
  await gotoClean(page, '/staff?q=&role=translator&lang=ja');
  assert(await page.locator('a[href^="/staff/"]').count() > 0, 'staff role/lang filter returned no staff links');
});

check('VNDB tag hierarchy skeleton, tree, click routing, and pagination', async (page) => {
  await page.route('**/api/tags/web-tree**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto(`${base}/tags?mode=vndb`, { waitUntil: 'domcontentloaded' });
  assert(await page.locator('[aria-busy="true"]').count() > 0, '/tags?mode=vndb did not show loading skeleton');
  await page.waitForSelector('text=Theme', { timeout: 20000 });
  for (const label of ['Theme', 'Character', 'Style', 'Plot', 'Setting']) {
    assert(await page.getByText(label, { exact: true }).count() > 0, `missing tag tree group ${label}`);
  }
  await page.getByRole('link', { name: /Fantasy/i }).first().click();
  await page.waitForURL(/\/tag\/g2\?tab=vndb/);
  await page.waitForSelector('text=Meilleurs VN avec ce tag, text=Top VNs with this tag', { timeout: 20000 }).catch(() => undefined);
  const next = page.getByRole('link', { name: /Suivant|Next|次/i }).first();
  if (await next.count()) {
    await next.click();
    await page.waitForURL(/page=2/);
  }
  await page.unroute('**/api/tags/web-tree**').catch(() => undefined);
});

check('recommendation seed picker updates URL and explanation exists', async (page) => {
  await gotoClean(page, '/recommendations?mode=similar-to-vn');
  const input = page.locator('input').filter({ hasText: '' }).first();
  await input.fill('v28032').catch(async () => {
    const anyInput = page.locator('input').first();
    await anyInput.fill('v28032');
  });
  await page.waitForTimeout(1000);
  const seedLink = page.locator('a[href*="seed=v28032"], button:has-text("v28032")').first();
  if (await seedLink.count()) await seedLink.click();
  await page.waitForTimeout(1000);
  assert(page.url().includes('seed=v28032') || await page.locator('text=v28032').count() > 0, 'seed picker did not select/update visible seed');
  assert(await page.locator('text=/Pourquoi|Why|理由/i').count() > 0, 'recommendation explanation panel missing');
});

check('shelf display controls change rendered CSS variables', async (page) => {
  await gotoClean(page, '/shelf');
  const root = page.locator('.shelf-view-root').first();
  await root.waitFor({ state: 'visible', timeout: 10000 });
  const before = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--shelf-cell-w-px') || el.style.getPropertyValue('--shelf-cell-w-px'));
  await page.getByRole('button', { name: /Options d'affichage de l'étagère|Shelf display options|表示/i }).first().click();
  const slider = page.locator('input[type="range"]').first();
  await slider.evaluate((el) => {
    const input = el;
    input.value = String(Math.min(Number(input.max), Number(input.value) + Number(input.step || 4) * 4));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
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

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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

await browser.close();
console.log('');
console.log(`Interaction QA summary: PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
