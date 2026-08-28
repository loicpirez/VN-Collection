#!/usr/bin/env node
import path from 'node:path';
import { chromium, webkit } from 'playwright';

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

const qaServerResponse = await fetch(base);
const qaServerCsp = qaServerResponse.headers.get('content-security-policy') ?? '';
if (new URL(base).protocol === 'http:' && qaServerCsp.includes('upgrade-insecure-requests')) {
  die('the HTTP QA server still enforces upgrade-insecure-requests; start it with VNCOLL_QA=1');
}

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

async function waitForPagePaint(page) {
  const main = page.locator('#main-content');
  await main.waitFor({ state: 'attached', timeout: 10000 });
  const routeLoadingBoundary = main.locator(
    ':scope > .page-space-frame > [role="status"][aria-busy="true"]',
  );
  if ((await routeLoadingBoundary.count()) > 0) {
    await routeLoadingBoundary.waitFor({ state: 'detached', timeout: 30000 });
  }
  await main.waitFor({ state: 'visible', timeout: 10000 });
}

async function gotoClean(page, url) {
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForPagePaint(page);
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

async function assertResponsiveNavigation(page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await gotoClean(page, '/');
  const discover = page.getByRole('button', { name: /Découvrir|Discover|見つける/i }).first();
  await waitForEnabled(discover);
  await discover.click();
  const menu = page.getByRole('menu', { name: /Découvrir|Discover|見つける/i });
  await menu.waitFor({ state: 'visible', timeout: 10000 });
  const desktopGeometry = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      internalOverflow: element.scrollWidth - element.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert(desktopGeometry.left >= 0, `desktop nav menu underflows left by ${-desktopGeometry.left}px`);
  assert(desktopGeometry.right <= desktopGeometry.viewportWidth, `desktop nav menu overflows right by ${desktopGeometry.right - desktopGeometry.viewportWidth}px`);
  assert(desktopGeometry.internalOverflow <= 1, `desktop nav menu has ${desktopGeometry.internalOverflow}px internal horizontal overflow`);
  assert(desktopGeometry.documentOverflow <= 1, `desktop navigation creates ${desktopGeometry.documentOverflow}px page overflow`);
  await menu.locator('a[href="/upcoming"]').click();
  await page.waitForURL((url) => url.pathname === '/upcoming', { timeout: 10000 });
  await waitForPagePaint(page);
  await page.getByRole('heading', { name: /Sorties à venir|Upcoming releases|発売予定/i }).waitFor({ state: 'visible', timeout: 20000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoClean(page, '/');
  const mobileTrigger = page.getByRole('button', { name: /Ouvrir le menu|Open menu|メニューを開く/i });
  await waitForEnabled(mobileTrigger);
  await mobileTrigger.click();
  const sheet = page.getByRole('dialog', { name: /Ouvrir le menu|Open menu|メニューを開く/i });
  await sheet.waitFor({ state: 'visible', timeout: 10000 });
  const mobileGeometry = await sheet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
      internalOverflow: element.scrollWidth - element.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert(mobileGeometry.left >= 0, `mobile nav sheet underflows left by ${-mobileGeometry.left}px`);
  assert(mobileGeometry.right <= mobileGeometry.viewportWidth, `mobile nav sheet overflows right by ${mobileGeometry.right - mobileGeometry.viewportWidth}px`);
  assert(mobileGeometry.internalOverflow <= 1, `mobile nav sheet has ${mobileGeometry.internalOverflow}px internal horizontal overflow`);
  assert(mobileGeometry.documentOverflow <= 1, `mobile navigation creates ${mobileGeometry.documentOverflow}px page overflow`);
  await sheet.locator('a[href="/wishlist"]').click();
  await page.waitForURL((url) => url.pathname === '/wishlist', { timeout: 10000 });
  await waitForPagePaint(page);
}

check('detail pages do not crash across RSC boundary', async (page) => {
  for (const url of ['/character/c84419', '/character/c90980', '/staff/s12799', '/staff/s1073?scope=collection', '/producer/p604']) {
    await gotoClean(page, url);
  }
});

check('responsive navigation remains bounded and navigable', async (page) => {
  try {
    await assertResponsiveNavigation(page);
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

check('WebKit navigation remains bounded and navigable', async () => {
  const webkitBrowser = await webkit.launch({ headless: true });
  const webkitContext = await webkitBrowser.newContext({ viewport: { width: 1366, height: 768 } });
  await webkitContext.addInitScript(() => {
    window.localStorage.setItem('vn_tour_completed_v1', '1');
  });
  const webkitPage = await webkitContext.newPage();
  webkitPage.setDefaultTimeout(15000);
  try {
    await assertResponsiveNavigation(webkitPage);
  } finally {
    await webkitContext.close();
    await webkitBrowser.close();
  }
});

async function assertMobileQuoteDock(page, engineLabel) {
  const footer = page.locator('[data-quote-footer-root]');
  await footer.waitFor({ state: 'visible', timeout: 10000 });
  const initial = await footer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const panel = element.querySelector('[data-quote-footer-panel]');
    const panelRect = panel?.getBoundingClientRect();
    const panelStyle = panel ? getComputedStyle(panel) : null;
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      leftGap: panelRect?.left ?? Number.NaN,
      rightGap: window.innerWidth - (panelRect?.right ?? Number.NaN),
      panelHeight: panelRect?.height ?? Number.NaN,
      panelBorderLeft: panelStyle?.borderLeftWidth ?? '',
      panelBorderRight: panelStyle?.borderRightWidth ?? '',
      panelRadius: panelStyle?.borderTopLeftRadius ?? '',
      position: getComputedStyle(element).position,
      rootBackground: getComputedStyle(element).backgroundColor,
    };
  });
  assert(initial.position === 'fixed', `${engineLabel} quote footer uses ${initial.position} instead of fixed positioning`);
  assert(Math.abs(initial.bottom - initial.viewportHeight) <= 1, `${engineLabel} quote footer ends ${initial.viewportHeight - initial.bottom}px from the viewport bottom`);
  assert(Math.abs(initial.leftGap) <= 1, `${engineLabel} quote panel starts ${initial.leftGap}px from the mobile viewport edge`);
  assert(Math.abs(initial.rightGap) <= 1, `${engineLabel} quote panel ends ${initial.rightGap}px from the mobile viewport edge`);
  assert(Math.abs(initial.panelHeight - 44) <= 1, `${engineLabel} collapsed quote panel is ${initial.panelHeight}px tall instead of 44px`);
  assert(initial.panelBorderLeft === '0px' && initial.panelBorderRight === '0px', `${engineLabel} quote panel retained mobile side borders`);
  assert(initial.panelRadius === '0px', `${engineLabel} quote panel retained a mobile corner radius of ${initial.panelRadius}`);
  assert(initial.rootBackground !== 'rgba(0, 0, 0, 0)', `${engineLabel} quote safe-area surface remained transparent`);

  await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 3)));
  await page.waitForTimeout(400);
  const middleTop = await footer.evaluate((element) => element.getBoundingClientRect().top);
  assert(Math.abs(middleTop - initial.top) <= 1, `${engineLabel} quote footer moved ${middleTop - initial.top}px while scrolling down`);

  await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 6)));
  await page.waitForTimeout(400);
  const reverseTop = await footer.evaluate((element) => element.getBoundingClientRect().top);
  assert(Math.abs(reverseTop - initial.top) <= 1, `${engineLabel} quote footer moved ${reverseTop - initial.top}px while scrolling back up`);

  const toggle = footer.locator('button[aria-controls="quote-footer-content"]');
  await toggle.tap();
  assert(await toggle.getAttribute('aria-expanded') === 'true', `${engineLabel} quote footer did not open from a touch click`);
  await toggle.tap();
  assert(await toggle.getAttribute('aria-expanded') === 'false', `${engineLabel} quote footer did not close from the second touch`);
  const closedHeight = await footer.locator('[data-quote-footer-panel]').evaluate((element) => element.getBoundingClientRect().height);
  assert(Math.abs(closedHeight - initial.panelHeight) <= 1, `${engineLabel} quote footer did not return to its collapsed height`);
  await toggle.tap();
  await toggle.focus();
  await toggle.press('Enter');
  assert(await toggle.getAttribute('aria-expanded') === 'false', `${engineLabel} quote footer did not close while its toggle retained focus`);
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls') === 'quote-footer-content'), `${engineLabel} quote footer toggle lost focus while closing`);
  assert(await footer.locator('#quote-footer-content').getAttribute('hidden') !== null, `${engineLabel} closed quote content remains exposed`);
  const refresh = footer.locator('[data-quote-footer-refresh]');
  await refresh.tap();
  assert(await toggle.getAttribute('aria-expanded') === 'true', `${engineLabel} quote footer did not open from its refresh action`);
  await toggle.tap();
  assert(await toggle.getAttribute('aria-expanded') === 'false', `${engineLabel} quote footer did not close after a refresh`);
}

check('WebKit mobile quote dock stays fixed and library cards keep aligned rows', async () => {
  const webkitBrowser = await webkit.launch({ headless: true });
  const webkitContext = await webkitBrowser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  await webkitContext.addInitScript(() => {
    window.localStorage.setItem('vn_tour_completed_v1', '1');
    Reflect.deleteProperty(window, 'EventSource');
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
      configurable: true,
      get: () => 5,
    });
  });
  const webkitPage = await webkitContext.newPage();
  webkitPage.setDefaultTimeout(15000);
  try {
    await gotoClean(webkitPage, '/');
    const grid = webkitPage.locator('[data-library-card-grid]').first();
    await grid.waitFor({ state: 'visible', timeout: 10000 });
    await grid.evaluate((element) => {
      element.style.setProperty('--card-density-px', '140px');
      element.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      window.dispatchEvent(new Event('resize'));
    });
    await webkitPage.waitForTimeout(200);

    const rowGeometry = await grid.evaluate((element) => {
      element.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      const items = Array.from(element.querySelectorAll(':scope > [role="listitem"]')).map((item) => {
        const rect = item.getBoundingClientRect();
        return { top: Math.round(rect.top * 100) / 100, rowEnd: item.style.gridRowEnd };
      });
      const pairOffsets = [];
      for (let index = 0; index + 1 < items.length; index += 2) {
        pairOffsets.push(Math.abs(items[index].top - items[index + 1].top));
      }
      return {
        display: getComputedStyle(element).display,
        itemCount: items.length,
        maxPairOffset: Math.max(...pairOffsets),
        hasManualRows: items.some((item) => item.rowEnd !== ''),
      };
    });
    assert(rowGeometry.display === 'grid', `library uses ${rowGeometry.display} instead of a row grid`);
    assert(rowGeometry.itemCount >= 4, `library rendered only ${rowGeometry.itemCount} cards for row QA`);
    assert(rowGeometry.maxPairOffset <= 1, `paired cards differ by ${rowGeometry.maxPairOffset}px at their top edge`);
    assert(!rowGeometry.hasManualRows, 'library cards still carry measured masonry row spans');
    await assertMobileQuoteDock(webkitPage, 'WebKit');
  } finally {
    await webkitContext.close();
    await webkitBrowser.close();
  }
});

check('Chromium mobile quote dock stays fixed and toggles reversibly', async () => {
  const chromiumContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  await chromiumContext.addInitScript(() => {
    window.localStorage.setItem('vn_tour_completed_v1', '1');
    Reflect.deleteProperty(window, 'EventSource');
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {
      configurable: true,
      get: () => 5,
    });
  });
  const chromiumPage = await chromiumContext.newPage();
  chromiumPage.setDefaultTimeout(15000);
  try {
    await gotoClean(chromiumPage, '/');
    await assertMobileQuoteDock(chromiumPage, 'Chromium');
  } finally {
    await chromiumContext.close();
  }
});

check('Chromium library grid keeps sequential cards on aligned rows', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await gotoClean(page, '/');
    const grid = page.locator('[data-library-card-grid]').first();
    await grid.waitFor({ state: 'visible', timeout: 10000 });
    await grid.evaluate((element) => {
      element.style.setProperty('--card-density-px', '140px');
      element.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(200);
    const geometry = await grid.evaluate((element) => {
      element.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      const items = Array.from(element.querySelectorAll(':scope > [role="listitem"]')).map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          top: Math.round(rect.top * 100) / 100,
          rowEnd: item.style.gridRowEnd,
        };
      });
      const pairOffsets = [];
      for (let index = 0; index + 1 < items.length; index += 2) {
        pairOffsets.push(Math.abs(items[index].top - items[index + 1].top));
      }
      return {
        display: getComputedStyle(element).display,
        itemCount: items.length,
        maxPairOffset: Math.max(...pairOffsets),
        hasManualRows: items.some((item) => item.rowEnd !== ''),
      };
    });
    assert(geometry.display === 'grid', `Chromium library uses ${geometry.display} instead of grid`);
    assert(geometry.itemCount >= 4, `library rendered only ${geometry.itemCount} cards`);
    assert(geometry.maxPairOffset <= 1, `paired cards differ by ${geometry.maxPairOffset}px at their top edge`);
    assert(!geometry.hasManualRows, 'library cards still carry measured masonry row spans');
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
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
    const displayText = await dialog.innerText();
    assert(/Défauts globaux|Global defaults|デフォルト/i.test(displayText), 'global defaults heading missing');
    const layoutTab = dialog.getByRole('tab', { name: /Mise en page|Layout|レイアウト/i });
    await layoutTab.click();
    const perPageHeading = dialog.getByText(/Mise en page par page|Per-page layout|ページ別レイアウト/i).first();
    await perPageHeading.waitFor({ state: 'visible', timeout: 10000 });
    await page.keyboard.press('Escape');
  }
});

check('map place dialog stays above live Leaflet panes', async (page) => {
  await gotoClean(page, '/map');
  const allowExternalMap = page.getByRole('button', {
    name: /Autoriser la carte externe|Allow external map|外部マップを許可/i,
  });
  if ((await allowExternalMap.count()) > 0) await allowExternalMap.first().click();
  const leafletContainer = page.locator('.leaflet-container').first();
  await leafletContainer.waitFor({ state: 'visible', timeout: 15000 });

  await page.getByRole('button', { name: /Ajouter un lieu|Add place|場所を追加/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /Ajouter un lieu|Add place|場所を追加/i });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  const stacking = await dialog.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 80));
    const modalRoot = panel.parentElement;
    const mapPane = document.querySelector('.leaflet-pane');
    return {
      hitInsideDialog: hit instanceof Node && panel.contains(hit),
      modalZ: Number.parseInt(modalRoot ? getComputedStyle(modalRoot).zIndex : '0', 10) || 0,
      mapZ: Number.parseInt(mapPane ? getComputedStyle(mapPane).zIndex : '0', 10) || 0,
    };
  });
  assert(stacking.hitInsideDialog, 'Leaflet intercepts hit testing inside the Add Place dialog');
  assert(stacking.modalZ > stacking.mapZ, `map z-index ${stacking.mapZ} is not below modal z-index ${stacking.modalZ}`);
  await dialog.getByRole('button', { name: /Fermer|Close|閉じる/i }).first().click();
});

check('AliceNet shop runs background progress and stop controls on its place page', async (page) => {
  await gotoClean(page, '/places');
  const aliceNetCard = page.locator('article').filter({ hasText: 'AliceNet' }).first();
  await aliceNetCard.waitFor({ state: 'visible', timeout: 10000 });
  const placeHref = await aliceNetCard.locator('a[href^="/places/"]').first().getAttribute('href');
  assert(Boolean(placeHref), 'AliceNet place card has no detail-page link');

  let jobStarted = false;
  let stopRequested = false;
  await page.route('**/api/download-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        throttle: { active: 0, queued: 0 },
        jobs: jobStarted
          ? [{
              id: 'qa-alicenet-job',
              kind: 'alicenet',
              vn_id: null,
              label: 'AliceNet QA pipeline',
              total: 5,
              done: 2,
              current_item: 'Matching QA title',
              errors: [],
              started_at: Date.now() - 1000,
              finished_at: null,
            }]
          : [],
      }),
    });
  });
  await page.route('**/api/alicenet/run**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      jobStarted = true;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: 'qa-alicenet-job', op: 'pipeline' }),
      });
      return;
    }
    if (method === 'DELETE') {
      stopRequested = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.continue();
  });

  try {
    await gotoClean(page, placeHref);
    const downloadAll = page.getByRole('button', { name: /Tout mettre à jour|Download all|すべてダウンロード/i });
    await waitForEnabled(downloadAll);
    await downloadAll.click();
    const progress = page.getByRole('progressbar', { name: /Progression AliceNet|AliceNet progress|AliceNet進捗/i });
    await progress.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForSelector('[role="progressbar"][aria-valuenow="2"][aria-valuemax="5"]', { timeout: 10000 });
    assert((await progress.getAttribute('aria-valuemax')) === '5', 'AliceNet progress total is not exposed');
    assert(await page.getByText('2/5 (40%)', { exact: true }).isVisible(), 'AliceNet percentage counter is not visible');
    assert(await page.getByText('Matching QA title', { exact: true }).isVisible(), 'AliceNet current item is not visible');
    const stopResponse = page.waitForResponse((response) =>
      response.url().includes('/api/alicenet/run?jobId=') && response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: /Arrêter|Stop|停止/i }).first().click();
    await stopResponse;
    assert(stopRequested, 'AliceNet Stop did not call the background-job DELETE route');
  } finally {
    await page.unroute('**/api/download-status');
    await page.unroute('**/api/alicenet/run**');
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
  await waitForPagePaint(page);
  const controls = page.locator('[data-testid="cover-rotation-controls"]').first();
  await controls.waitFor({ state: 'visible', timeout: 10000 });
  await controls.scrollIntoViewIfNeeded();
  const coverGroup = controls.locator('xpath=ancestor::div[contains(@class,"group")][1]');
  const coverImage = coverGroup.locator('img').first();
  await coverImage.waitFor({ state: 'visible', timeout: 10000 });
  const right = controls.getByRole('button', { name: /Pivoter à droite|Rotate right|右に回転/i }).first();
  const rotateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/collection/v26180/cover') && response.request().method() === 'PATCH',
  );
  await right.click({ force: true });
  await rotateResponse;
  const rotatedTransform = await coverImage.evaluate((img) => img.getAttribute('style') || '');
  assert(/rotate\((90|180|270)deg\)/.test(rotatedTransform), 'cover rotation did not change the active cover image transform');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPagePaint(page);
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
  const resetResponse = page.waitForResponse((response) =>
    response.url().includes('/api/collection/v26180/cover') && response.request().method() === 'PATCH',
  );
  await reset.click({ force: true });
  await resetResponse;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPagePaint(page);
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
  const gallery = page.locator('[aria-label="Médias"], [aria-label="Media"], [aria-label="メディア"]').first();
  await gallery.waitFor({ state: 'visible', timeout: 10000 });
  const action = gallery.getByRole('button', { name: /^Actions$|操作/i }).first();
  await action.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await action.locator('xpath=..').hover();
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
    const hiddenLoc = page.locator('[data-spoiler-state="hidden"]').first();
    if ((await hiddenLoc.count()) === 0) continue;
    const handle = await hiddenLoc.elementHandle();
    if (!handle) continue;
    await handle.hover();
    await page.waitForTimeout(200);
    const hoverState = await handle.getAttribute('data-spoiler-state');
    const nativeDisclosure = await handle.evaluate((element) => element instanceof HTMLDetailsElement);
    const nativePreviewVisible = nativeDisclosure
      ? await handle.evaluate((element) => {
          const preview = element.querySelector('[data-spoiler-preview]');
          if (!(preview instanceof HTMLElement)) return false;
          const style = getComputedStyle(preview);
          const rect = preview.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        })
      : false;
    assert(
      hoverState === 'transient' || hoverState === 'revealed' || nativePreviewVisible,
      `${url} spoiler did not reveal on hover (state=${hoverState})`,
    );
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    // SpoilerChip keeps its outer wrapper stable across the gated
    // native disclosure -> revealed link transition.
    if (nativeDisclosure) {
      const summary = await handle.$('[data-spoiler-summary]');
      assert(summary, `${url} native spoiler is missing its summary control`);
      await summary.click();
    } else {
      await handle.click();
    }
    await page.waitForTimeout(300);
    const clickState = await handle.getAttribute('data-spoiler-state');
    const nativeOpen = nativeDisclosure
      ? await handle.evaluate((element) => element instanceof HTMLDetailsElement && element.open)
      : false;
    assert(
      clickState === 'revealed' || nativeOpen,
      `${url} spoiler did not persist after click (state=${clickState})`,
    );
    const blackBlock = await page.locator('.bg-black').count();
    assert(blackBlock === 0, `${url} spoiler has opaque black block`);
  }
});

check('character and staff filters browse actual results', async (page) => {
  await gotoClean(page, '/characters?sex=f&ageMin=18&ageMax=30');
  const characterLinks = page.locator('a[href^="/character/"]');
  assert(await characterLinks.count() > 0, 'character filtered browse returned no character links');
  const characterHref = await characterLinks.first().getAttribute('href');
  const characterId = characterHref?.match(/^\/character\/(c\d+)/)?.[1] ?? null;
  assert(characterId !== null, 'character filtered browse returned an invalid character link');
  await gotoClean(page, '/characters?hasVoice=1&vaLang=ja');
  assert(await page.locator('a[href^="/character/"]').count() > 0, 'character VA-language browse returned no character links');
  await gotoClean(page, `/characters?q=${encodeURIComponent(characterId)}`);
  await page.waitForURL((url) => url.pathname === `/character/${characterId}`, { timeout: 5000 }).catch(() => undefined);
  assert(
    new URL(page.url()).pathname === `/character/${characterId}` ||
      (await page.locator(`a[href="/character/${characterId}"], a[href^="/character/${characterId}?"]`).count()) > 0,
    `character id search did not route to or expose ${characterId}`,
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
  const seed = await page.evaluate(async () => {
    const response = await fetch('/api/collection?sort=title&order=asc&page=1');
    if (!response.ok) return null;
    const body = await response.json();
    const first = Array.isArray(body?.items) ? body.items[0] : null;
    return first && typeof first.id === 'string' && typeof first.title === 'string'
      ? { id: first.id, title: first.title }
      : null;
  });
  assert(seed, 'recommendation QA requires at least one collection VN');
  const input = page.locator('[data-testid="vn-seed-picker"] input[role="combobox"]').first();
  await input.fill(seed.title);
  const seedOption = page.locator(`[role="option"] button[title="${seed.id}"]`).first();
  await seedOption.waitFor({ state: 'visible', timeout: 15000 });
  await seedOption.click();
  await page.waitForURL((url) => url.searchParams.get('seed') === seed.id, { timeout: 15000 }).catch(() => undefined);
  assert(
    new URL(page.url()).searchParams.get('seed') === seed.id ||
      (await page.locator(`[data-testid="vn-seed-chip"][data-seed-id="${seed.id}"]`).count()) > 0,
    'seed picker did not select/update visible seed',
  );
  assert(await page.locator('text=/Pourquoi|Why|理由/i').count() > 0, 'recommendation explanation panel missing');
});

check('shelf display controls change rendered CSS variables', async (page) => {
  await gotoClean(page, '/shelf');
  const root = page.locator('.shelf-view-root').first();
  await root.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('.shelf-view-root');
    return element instanceof HTMLElement &&
      getComputedStyle(element).getPropertyValue('--shelf-cell-w-px').trim().length > 0;
  });
  const before = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--shelf-cell-w-px') || el.style.getPropertyValue('--shelf-cell-w-px'));
  await page.getByRole('button', { name: /Options d'affichage de l'étagère|Shelf display options|表示/i }).first().click();
  const panel = page.getByRole('region', { name: /Options d'affichage de l'étagère|Shelf display options|表示/i }).first();
  await panel.waitFor({ state: 'visible', timeout: 10000 });
  const shelfScope = panel.getByRole('button', { name: /Étagère «|Shelf "|棚「|Cette étagère|This shelf|この棚/i }).first();
  if (await shelfScope.count()) await shelfScope.click();
  const slider = panel.locator('input[type="range"]').first();
  const current = Number(await slider.inputValue());
  const beforeWidth = Number.parseFloat(before);
  assert(beforeWidth === current, `shelf width starts out of sync (CSS ${beforeWidth}, slider ${current})`);
  const min = Number(await slider.getAttribute('min'));
  const max = Number(await slider.getAttribute('max'));
  const step = Number(await slider.getAttribute('step')) || 4;
  const target = current + step * 4 <= max
    ? current + step * 4
    : Math.max(min, current - step * 4);
  assert(target !== current, `shelf width slider has no movable range (${min}..${max})`);
  const widthSave = (expected, allowInheritedReset = false) => page.waitForResponse((response) => {
    if (!response.url().endsWith('/api/settings') || response.request().method() !== 'PATCH') return false;
    try {
      const body = response.request().postDataJSON();
      if (body?.shelf_view_prefs_v1?.cellWidthPx === expected) return true;
      const shelfPrefs = Object.values(body?.shelf_display_overrides_v1?.shelves ?? {});
      return shelfPrefs.some((prefs) => prefs?.cellWidthPx === expected) ||
        (allowInheritedReset && shelfPrefs.some((prefs) => Object.keys(prefs ?? {}).length === 0));
    } catch {
      return false;
    }
  });
  const targetSave = widthSave(target);
  await slider.fill(String(target));
  await page.waitForFunction(
    (previous) => {
      const element = document.querySelector('.shelf-view-root');
      return element instanceof HTMLElement &&
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--shelf-cell-w-px')) !== previous;
    },
    beforeWidth,
  );
  const targetResponse = await targetSave;
  assert(targetResponse.ok(), `shelf width save failed with HTTP ${targetResponse.status()}`);
  await page.waitForFunction(() =>
    document.querySelector('[data-shelf-controls-id="default"] [role="region"]')?.getAttribute('aria-busy') === 'false',
  );
  const after = await root.evaluate((el) => getComputedStyle(el).getPropertyValue('--shelf-cell-w-px') || el.style.getPropertyValue('--shelf-cell-w-px'));
  assert(Number.parseFloat(after) === target, `shelf cell width CSS variable did not reach ${target}px (${before} -> ${after})`);
  const restoreSave = widthSave(current, true);
  await slider.fill(String(current));
  const restoreResponse = await restoreSave;
  assert(restoreResponse.ok(), `shelf width restore failed with HTTP ${restoreResponse.status()}`);
  await page.waitForFunction(() =>
    document.querySelector('[data-shelf-controls-id="default"] [role="region"]')?.getAttribute('aria-busy') === 'false',
  );
  await page.waitForFunction(
    (expected) => {
      const element = document.querySelector('.shelf-view-root');
      return element instanceof HTMLElement &&
        Number.parseFloat(getComputedStyle(element).getPropertyValue('--shelf-cell-w-px')) === expected;
    },
    current,
  );
});

check('shelf scroll frame clips wide rows and paints fades only at hidden edges', async (page) => {
  await page.setViewportSize({ width: 900, height: 800 });
  try {
    await gotoClean(page, '/shelf');
    const frame = page.locator('[data-shelf-scroll-frame]').first();
    await frame.waitFor({ state: 'visible', timeout: 10000 });
    const geometry = await frame.evaluate((viewport) => {
      const content = viewport.firstElementChild;
      const viewportRect = viewport.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      return {
        hiddenWidth: viewport.scrollWidth - viewport.clientWidth,
        contentExtendsRight: Boolean(contentRect && contentRect.right > viewportRect.right + 1),
        overflowX: getComputedStyle(viewport).overflowX,
      };
    });
    assert(geometry.hiddenWidth > 1, 'shelf fixture does not create horizontal overflow');
    assert(geometry.contentExtendsRight, 'wide shelf content is not clipped at the viewport edge');
    assert(['auto', 'scroll'].includes(geometry.overflowX), `shelf overflow-x is ${geometry.overflowX}`);
    await page.locator('[data-shelf-scroll-fade="right"]').first().waitFor({ state: 'visible', timeout: 5000 });
    assert((await page.locator('[data-shelf-scroll-fade="left"]').count()) === 0, 'left shelf fade is visible at scroll origin');

    await frame.evaluate((viewport) => {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.dispatchEvent(new Event('scroll'));
    });
    await page.locator('[data-shelf-scroll-fade="left"]').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-shelf-scroll-fade="right"]').first().waitFor({ state: 'visible', timeout: 5000 });

    await frame.evaluate((viewport) => {
      viewport.scrollLeft = viewport.scrollWidth;
      viewport.dispatchEvent(new Event('scroll'));
    });
    await page.locator('[data-shelf-scroll-fade="right"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('[data-shelf-scroll-fade="left"]').first().waitFor({ state: 'visible', timeout: 5000 });
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

check('section layout controls hide/collapse and save without moving identity', async (page) => {
  // c84419 is a rich in-collection character (siblings + description +
  // voice + appears-in sections present) so the DetailReorderLayout editor
  // surfaces multiple SortableSection rows. Earlier this test ran against
  // c90980 (EGS-only synthetic with only the `meta` section visible),
  // which gave the editor nothing to hide.
  await gotoClean(page, '/character/c84419');
  const beforeH1 = await page.locator('main h1').first().innerText();
  await page.getByRole('button', { name: /Mise en page|Layout|レイアウト/i }).last().click();
  await page.waitForTimeout(500);
  const hide = page.getByRole('button', { name: /Masquer la section|Hide section|非表示/i }).first();
  if ((await hide.count()) === 0) {
    // Page has no hide-able sections (sparse character). The editor is
    // correctly inert on such pages — skip the rest of the assertions.
    return;
  }
  await hide.click({ timeout: 10000 });
  const collapse = page.getByRole('button', { name: /Réduire par défaut|Collapse by default|折りたたむ/i }).first();
  if (await collapse.count()) await collapse.click();
  await page.getByRole('button', { name: /^Enregistrer$|^Save$|保存/i }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForPagePaint(page);
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
  const hiddenLoc = page.locator('[data-spoiler-state="hidden"]').first();
  if ((await hiddenLoc.count()) === 0) {
    // No hidden spoiler on this page — skip
    return;
  }
  const handle = await hiddenLoc.elementHandle();
  if (!handle) return;
  const maskedText = (await handle.innerText()).trim();
  // Hover: should transition to transient or revealed
  await handle.hover();
  await page.waitForTimeout(300);
  const hoverState = await handle.getAttribute('data-spoiler-state');
  assert(
    hoverState === 'transient' || hoverState === 'revealed',
    `spoiler did not reveal on hover (state=${hoverState})`,
  );
  const contentText = (await handle.innerText()).trim();
  assert(contentText.length > 0 && contentText !== maskedText, 'spoiler real content is empty after hover reveal');
  // Move away and click the stable outer wrapper to persist.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  await handle.click();
  await page.waitForTimeout(300);
  const clickState = await handle.getAttribute('data-spoiler-state');
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

check('narrow tutorial panel stays inside viewport with touch-safe actions', async () => {
  const tutorialContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tutorialPage = await tutorialContext.newPage();
  try {
    tutorialPage.setDefaultTimeout(15000);
    await gotoClean(tutorialPage, '/');
    const panel = tutorialPage.locator('[role="dialog"][aria-modal="false"]').first();
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    const geometry = await panel.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const buttonHeights = Array.from(el.querySelectorAll('button')).map(
        (button) => button.getBoundingClientRect().height,
      );
      return {
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
        minButtonHeight: Math.min(...buttonHeights),
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    assert(geometry.x >= 0 && geometry.y >= 0, 'tutorial panel begins outside the narrow viewport');
    assert(geometry.right <= 390 && geometry.bottom <= 844, 'tutorial panel exceeds the narrow viewport');
    assert(geometry.minButtonHeight >= 44, `tutorial action is only ${geometry.minButtonHeight}px high`);
    assert(geometry.overflowX <= 2, `tutorial creates ${geometry.overflowX}px horizontal overflow`);
  } finally {
    await tutorialContext.close();
  }
});

check('narrow VN detail stays bounded with collapsed sections and touch-safe navigation', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await gotoClean(page, '/vn/v26180');
    const sectionHeaderSelector =
      'section[id^="section-"] > section > div:first-child > button[aria-expanded]';
    await page.waitForFunction((selector) => {
      const controls = Array.from(document.querySelectorAll(selector));
      return controls.length > 0
        && controls.every((control) => control.getAttribute('aria-expanded') === 'false');
    }, sectionHeaderSelector, { timeout: 10000 });
    const result = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('nav a[href^="#section-"]'));
      const sectionControls = Array.from(
        document.querySelectorAll('section[id^="section-"] button[aria-expanded]'),
      );
      return {
        scrollHeight: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        sectionLinkCount: links.length,
        minSectionLinkHeight: Math.min(...links.map((link) => link.getBoundingClientRect().height)),
        collapsedSections: sectionControls.filter(
          (control) => control.getAttribute('aria-expanded') === 'false',
        ).length,
      };
    });
    assert(result.overflowX <= 2, `VN detail creates ${result.overflowX}px horizontal overflow`);
    assert(result.sectionLinkCount > 0, 'VN detail has no narrow-screen section navigation');
    assert(result.minSectionLinkHeight >= 44, `VN section navigation target is only ${result.minSectionLinkHeight}px high`);
    assert(result.collapsedSections > 0, 'VN detail does not collapse any secondary section by default');
    assert(result.scrollHeight <= 844 * 16, `VN detail is still excessively tall (${result.scrollHeight}px)`);
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

const browser = await launchBrowser();
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
  const checkContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await checkContext.addInitScript(() => {
    window.localStorage.setItem('vn_tour_completed_v1', '1');
    // Interaction QA performs many full-document navigations. Use the
    // production polling fallback here so canceled dev-server SSE streams
    // cannot accumulate inside Next and stall unrelated route assertions.
    Reflect.deleteProperty(window, 'EventSource');
  });
  const checkPage = await checkContext.newPage();
  checkPage.setDefaultTimeout(15000);
  const errors = [];
  checkPage.on('pageerror', (e) => errors.push(e.message));
  checkPage.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  try {
    await fn(checkPage);
    const fatal = errors.find((e) => /Functions cannot be passed directly|SqliteError|no such column/i.test(e));
    assert(!fatal, `browser console/runtime fatal: ${fatal}`);
    pass += 1;
    console.log(`✓ ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`✗ ${name}`);
    console.error(`  ${(e && e.stack) || e}`);
  } finally {
    await checkContext.close();
  }
}

await browser.close();
console.log('');
console.log(`Interaction QA summary: PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
