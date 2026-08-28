#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { QA_IDS } from './qa-ids.mjs';

const baseURL = process.env.RESPONSIVE_BASE_URL ?? 'http://localhost:3101';
const outputPath = resolve(process.env.RESPONSIVE_OUTPUT ?? '.tmp/responsive-audit-results.json');
const screenshotMode = process.env.RESPONSIVE_SCREENSHOTS ?? 'findings';
const screenshotDirectory = resolve(process.env.RESPONSIVE_SCREENSHOT_DIR ?? '.tmp/responsive-audit');
const screenshotFullPage = process.env.RESPONSIVE_SCREENSHOT_FULL_PAGE === '1';
const basicUser = process.env.RESPONSIVE_USER;
const basicPassword = process.env.RESPONSIVE_PASSWORD;
const expectedPageCount = 40;

if (!['all', 'findings', 'none'].includes(screenshotMode)) {
  throw new Error(`Unknown screenshot mode: ${screenshotMode}`);
}

const routes = [
  { key: 'library', path: '/' },
  { key: 'wishlist', path: '/wishlist' },
  { key: 'search', path: '/search' },
  { key: 'upcoming', path: '/upcoming' },
  { key: 'top-ranked', path: '/top-ranked' },
  { key: 'recommendations', path: '/recommendations' },
  { key: 'similar', path: '/similar' },
  { key: 'compare', path: `/compare?ids=${QA_IDS.VN_TOOLBAR}%2C${QA_IDS.VN_SIMILAR_SEED}` },
  { key: 'quotes', path: '/quotes' },
  { key: 'lists', path: '/lists' },
  { key: 'producers', path: '/producers' },
  { key: 'series', path: '/series' },
  { key: 'tags', path: '/tags' },
  { key: 'traits', path: '/traits' },
  { key: 'characters', path: '/characters' },
  { key: 'staff', path: '/staff' },
  { key: 'brand-overlap', path: '/brand-overlap' },
  { key: 'stats', path: '/stats' },
  { key: 'shelf', path: '/shelf' },
  { key: 'year', path: `/year?y=${new Date().getFullYear()}` },
  { key: 'labels', path: '/labels' },
  { key: 'dumped', path: '/dumped' },
  { key: 'activity', path: '/activity' },
  { key: 'steam', path: '/steam' },
  { key: 'egs', path: '/egs' },
  { key: 'stock', path: '/stock' },
  { key: 'places', path: '/places' },
  { key: 'map', path: '/map' },
  { key: 'schema', path: '/schema' },
  { key: 'data', path: '/data' },
  { key: 'character-detail', path: `/character/${QA_IDS.CHARACTER_WITH_SPOILER_TRAITS}` },
  { key: 'list-detail', path: '/lists/1' },
  { key: 'place-detail', path: '/places/6' },
  { key: 'producer-detail', path: `/producer/${QA_IDS.PRODUCER_WITH_EXTLINKS}` },
  { key: 'release-detail', path: '/release/r42581' },
  { key: 'series-detail', path: '/series/2' },
  { key: 'staff-detail', path: `/staff/${QA_IDS.STAFF_COLLECTION_SCOPED}?scope=collection` },
  { key: 'tag-detail', path: `/tag/${QA_IDS.TAG_PAGINATION}` },
  { key: 'trait-detail', path: '/trait/i6' },
  { key: 'vn-detail', path: `/vn/${QA_IDS.VN_TOOLBAR}` },
];

const engines = {
  chromium,
  firefox,
  webkit,
};

const viewports = {
  narrow: { width: 320, height: 568, touch: true },
  phone: { width: 390, height: 844, touch: true },
  landscape: { width: 844, height: 390, touch: true },
  tablet: { width: 768, height: 1024, touch: true },
  desktop: { width: 1440, height: 1000, touch: false },
};

function selectKeys(raw, available, label) {
  if (!raw) return Object.keys(available);
  const selected = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const invalid = selected.filter((value) => !(value in available));
  if (invalid.length > 0) throw new Error(`Unknown ${label}: ${invalid.join(', ')}`);
  return selected;
}

function selectRoutes(raw) {
  if (!raw) return routes;
  const selected = new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
  const invalid = [...selected].filter((key) => !routes.some((route) => route.key === key));
  if (invalid.length > 0) throw new Error(`Unknown route keys: ${invalid.join(', ')}`);
  return routes.filter((route) => selected.has(route.key));
}

const selectedEngines = selectKeys(process.env.RESPONSIVE_ENGINES, engines, 'browser engines');
const selectedViewports = selectKeys(process.env.RESPONSIVE_VIEWPORTS, viewports, 'viewports');
const selectedRoutes = selectRoutes(process.env.RESPONSIVE_ROUTE_KEYS);
const selectedLocales = (process.env.RESPONSIVE_LOCALES ?? 'fr')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => ['fr', 'en', 'ja'].includes(value));

if (routes.length !== expectedPageCount) {
  throw new Error(`Responsive route inventory drifted: expected ${expectedPageCount}, got ${routes.length}`);
}
if (selectedLocales.length === 0) throw new Error('No valid responsive audit locale selected');

const fatalPattern = /Application error|Unhandled Runtime Error|Functions cannot be passed directly|SqliteError|Internal Server Error/i;
const results = [];
let completedCount = 0;

async function waitForPaint(page) {
  const main = page.locator('#main-content');
  await main.waitFor({ state: 'attached', timeout: 30_000 });
  const routeLoading = main.locator(':scope > .page-space-frame > [role="status"][aria-busy="true"]');
  if (await routeLoading.count()) {
    await routeLoading.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  }
  await main.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 35_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

async function measure(page, touch, expectedLocale, routeKey) {
  return page.evaluate(({ touch, expectedLocale, routeKey, fatalSource }) => {
    const isRendered = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.contentVisibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const descriptor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        className: String(element.getAttribute('class') ?? '').slice(0, 180),
      };
    };
    const hasClippingAncestor = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = getComputedStyle(current);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
        current = current.parentElement;
      }
      return false;
    };
    const interactiveSelector = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"]';
    const interactive = Array.from(document.querySelectorAll(interactiveSelector)).filter(isRendered);
    const smallTargets = touch
      ? interactive.filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.pointerEvents === 'none' || element.closest('[inert]')) return false;
        if (element.getAttribute('aria-hidden') === 'true' || element.classList.contains('sr-only')) return false;
        if (element.tagName === 'A' && style.display === 'inline') return false;
        const parentTarget = element.parentElement?.closest(interactiveSelector);
        if (parentTarget && parentTarget !== element) {
          const parentRect = parentTarget.getBoundingClientRect();
          if (parentRect.width >= 44 && parentRect.height >= 44) return false;
        }
        const label = element.closest('label');
        if (label && label !== element) {
          const labelRect = label.getBoundingClientRect();
          if (labelRect.width >= 44 && labelRect.height >= 44) return false;
        }
        return rect.width < 44 || rect.height < 44;
      }).map(descriptor).slice(0, 100)
      : [];
    const clippedControls = interactive.filter((element) => {
      const style = getComputedStyle(element);
      if (element.classList.contains('sr-only')) return false;
      if (!element.textContent?.trim()) return false;
      if (!/(hidden|clip)/.test(style.overflowX)) return false;
      if (element.getAttribute('title') || element.getAttribute('aria-label')) return false;
      return element.scrollWidth > element.clientWidth + 1;
    }).map(descriptor).slice(0, 50);
    const escapedElements = Array.from(document.body.querySelectorAll('*')).filter((element) => {
      if (!isRendered(element) || hasClippingAncestor(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1;
    }).map(descriptor).slice(0, 50);
    const fixedOutOfBounds = Array.from(document.body.querySelectorAll('*')).filter((element) => {
      if (!isRendered(element) || getComputedStyle(element).position !== 'fixed') return false;
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1;
    }).map(descriptor).slice(0, 50);
    const cardGrid = routeKey === 'library' ? document.querySelector('[data-library-card-grid]') : null;
    let cardRowOffset = 0;
    let cardVisibleBottomOffset = 0;
    let cardColumnCount = 0;
    if (cardGrid) {
      const columns = getComputedStyle(cardGrid).gridTemplateColumns.split(' ').filter(Boolean).length;
      cardColumnCount = columns;
      const cards = Array.from(cardGrid.querySelectorAll(':scope > [role="listitem"]'));
      for (let index = 0; index < cards.length; index += Math.max(columns, 1)) {
        const row = cards.slice(index, index + columns);
        if (row.length < 2) continue;
        const tops = row.map((card) => card.getBoundingClientRect().top);
        cardRowOffset = Math.max(cardRowOffset, Math.max(...tops) - Math.min(...tops));
        const visibleBottoms = row.map((card) => (
          card.firstElementChild?.getBoundingClientRect().bottom
          ?? card.getBoundingClientRect().bottom
        ));
        cardVisibleBottomOffset = Math.max(cardVisibleBottomOffset, Math.max(...visibleBottoms) - Math.min(...visibleBottoms));
      }
    }
    const quote = document.querySelector('[data-quote-footer-root]');
    const quoteRect = quote?.getBoundingClientRect() ?? null;
    const quotePanelRect = quote?.querySelector('[data-quote-footer-panel]')?.getBoundingClientRect() ?? null;
    const quoteGeometry = quoteRect ? {
      position: getComputedStyle(quote).position,
      left: quoteRect.left,
      right: quoteRect.right,
      bottom: quoteRect.bottom,
      panelLeft: quotePanelRect?.left ?? null,
      panelRight: quotePanelRect?.right ?? null,
    } : null;
    const recoveredImageFallbacks = Array.from(document.querySelectorAll('[data-safe-image-fallback-from]'))
      .map((element) => {
        const from = element.getAttribute('data-safe-image-fallback-from');
        const to = element.getAttribute('data-safe-image-fallback-to');
        const image = element.querySelector('img');
        if (!from || !to || !image?.complete || image.naturalWidth <= 0) return null;
        return {
          from: new URL(from, location.href).href,
          to: new URL(to, location.href).href,
        };
      })
      .filter(Boolean);
    return {
      title: document.title,
      language: document.documentElement.lang,
      languageMatches: document.documentElement.lang === expectedLocale,
      fatal: new RegExp(fatalSource, 'i').test(document.body.innerText),
      mainCount: document.querySelectorAll('main#main-content').length,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      smallTargets,
      clippedControls,
      escapedElements,
      fixedOutOfBounds,
      cardRowOffset: Math.round(cardRowOffset * 100) / 100,
      cardVisibleBottomOffset: Math.round(cardVisibleBottomOffset * 100) / 100,
      cardColumnCount,
      quoteGeometry,
      recoveredImageFallbacks,
      touch,
    };
  }, { touch, expectedLocale, routeKey, fatalSource: fatalPattern.source });
}

function collectIssues(result) {
  const issues = [];
  if (result.status !== 200) issues.push(`HTTP ${result.status ?? 'navigation failure'}`);
  if (result.mainCount !== 1) issues.push(`main landmark count ${result.mainCount}`);
  if (!result.languageMatches) issues.push(`document language ${result.language}`);
  if (result.fatal) issues.push('fatal runtime content');
  if (result.documentWidth > result.viewportWidth + 1 || result.bodyWidth > result.viewportWidth + 1) {
    issues.push(`document overflow ${Math.max(result.documentWidth, result.bodyWidth) - result.viewportWidth}px`);
  }
  if (result.escapedElements.length > 0) issues.push(`${result.escapedElements.length} unbounded elements`);
  if (result.smallTargets.length > 0) issues.push(`${result.smallTargets.length} touch targets below 44px`);
  if (result.clippedControls.length > 0) issues.push(`${result.clippedControls.length} clipped controls`);
  if (result.fixedOutOfBounds.length > 0) issues.push(`${result.fixedOutOfBounds.length} fixed elements outside viewport`);
  if (result.cardRowOffset > 1) issues.push(`library row offset ${result.cardRowOffset}px`);
  if (result.cardVisibleBottomOffset > 1) issues.push(`library visible card bottom offset ${result.cardVisibleBottomOffset}px`);
  if (result.route === 'library' && result.viewport === 'phone' && result.cardColumnCount < 2) {
    issues.push(`compact library rendered ${result.cardColumnCount} column`);
  }
  if (!result.quoteGeometry) {
    issues.push('quote footer missing');
  } else {
    if (result.quoteGeometry.position !== 'fixed') issues.push(`quote position ${result.quoteGeometry.position}`);
    if (result.quoteGeometry.left < -1 || result.quoteGeometry.right > result.viewportWidth + 1) {
      issues.push('quote root exceeds the viewport');
    }
    if (
      result.quoteGeometry.panelLeft !== null
      && result.quoteGeometry.panelRight !== null
      && (result.quoteGeometry.panelLeft < -1 || result.quoteGeometry.panelRight > result.viewportWidth + 1)
    ) {
      issues.push('quote panel exceeds the viewport');
    }
    if (
      result.touch
      && result.quoteGeometry.panelLeft !== null
      && result.quoteGeometry.panelRight !== null
      && (Math.abs(result.quoteGeometry.panelLeft) > 1 || Math.abs(result.quoteGeometry.panelRight - result.viewportWidth) > 1)
    ) {
      issues.push('quote panel is not full-width on touch');
    }
    if (Math.abs(result.quoteGeometry.bottom - viewports[result.viewport].height) > 1) {
      issues.push('quote is not anchored to the viewport bottom');
    }
  }
  if (result.browserErrors.length > 0) issues.push(`${result.browserErrors.length} browser errors`);
  return issues;
}

function classifyBrowserErrors(errors, recoveredImageFallbacks) {
  const recoveredUrls = new Set(recoveredImageFallbacks.map((fallback) => fallback.from));
  const blocking = [];
  const recovered = [];
  for (const error of [...new Set(errors)]) {
    const recoveredUrl = [...recoveredUrls].find((url) => (
      error === `HTTP 404 ${url}` || error.startsWith(`console ${url}:`)
    ));
    if (recoveredUrl) recovered.push(error);
    else blocking.push(error);
  }
  return { blocking, recovered };
}

for (const engineName of selectedEngines) {
  const browser = await engines[engineName].launch({ headless: true });
  try {
    for (const locale of selectedLocales) {
      for (const viewportName of selectedViewports) {
        const viewport = viewports[viewportName];
        const contextOptions = {
          viewport: { width: viewport.width, height: viewport.height },
          hasTouch: viewport.touch,
          deviceScaleFactor: viewport.touch ? 2 : 1,
          locale: locale === 'ja' ? 'ja-JP' : locale === 'fr' ? 'fr-FR' : 'en-US',
          colorScheme: 'dark',
        };
        if (viewport.touch && engineName !== 'firefox') contextOptions.isMobile = true;
        if (basicUser && basicPassword) {
          contextOptions.httpCredentials = { username: basicUser, password: basicPassword };
        }
        const context = await browser.newContext(contextOptions);
        await context.addCookies([{ name: 'locale', value: locale, url: baseURL }]);
        await context.addInitScript(() => {
          localStorage.setItem('vn_tour_completed_v1', '1');
          localStorage.setItem('vncoll.map.privacy-notice-dismissed.v1', 'true');
          localStorage.setItem('vn_display_settings_v1', JSON.stringify({
            cardDensityPx: 220,
            density: { library: 160 },
          }));
          localStorage.setItem('vn_display_settings_legacy_library_seeded_v1', '1');
          Reflect.deleteProperty(window, 'EventSource');
        });
        for (const route of selectedRoutes) {
          const page = await context.newPage();
          const browserErrors = [];
          page.on('console', (message) => {
            if (message.type() === 'error') {
              const location = message.location().url;
              browserErrors.push(`console${location ? ` ${location}` : ''}: ${message.text()}`);
            }
          });
          page.on('response', (received) => {
            if (received.status() >= 400) browserErrors.push(`HTTP ${received.status()} ${received.url()}`);
          });
          page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));
          let response = null;
          let navigationError = null;
          try {
            response = await page.goto(`${baseURL}${route.path}`, {
              waitUntil: 'domcontentloaded',
              timeout: 45_000,
            });
            await waitForPaint(page);
            await response?.finished().catch(() => null);
          } catch (error) {
            navigationError = error instanceof Error ? error.message : String(error);
          }
          const metrics = await measure(page, viewport.touch, locale, route.key).catch((error) => ({
            title: '',
            language: '',
            languageMatches: false,
            fatal: true,
            mainCount: 0,
            viewportWidth: viewport.width,
            documentWidth: viewport.width,
            bodyWidth: viewport.width,
            smallTargets: [],
            clippedControls: [],
            escapedElements: [],
            fixedOutOfBounds: [],
            cardRowOffset: 0,
            cardVisibleBottomOffset: 0,
            cardColumnCount: 0,
            quoteGeometry: null,
            recoveredImageFallbacks: [],
            measurementError: error instanceof Error ? error.message : String(error),
          }));
          const classifiedErrors = classifyBrowserErrors(browserErrors, metrics.recoveredImageFallbacks);
          const result = {
            engine: engineName,
            locale,
            viewport: viewportName,
            route: route.key,
            path: route.path,
            status: response?.status() ?? null,
            navigationError,
            browserErrors: classifiedErrors.blocking,
            recoveredBrowserErrors: classifiedErrors.recovered,
            ...metrics,
          };
          result.issues = collectIssues(result);
          if (result.navigationError) result.issues.unshift(`navigation: ${result.navigationError}`);
          if (result.measurementError) result.issues.unshift(`measurement: ${result.measurementError}`);
          results.push(result);
          completedCount += 1;
          if (completedCount % 10 === 0) {
            console.log(`Responsive audit progress: ${completedCount}/${selectedEngines.length * selectedLocales.length * selectedViewports.length * selectedRoutes.length}`);
          }
          const shouldCaptureScreenshot = screenshotMode === 'all'
            || (screenshotMode === 'findings' && result.issues.length > 0);
          if (shouldCaptureScreenshot) {
            const screenshotPath = resolve(screenshotDirectory, `${engineName}-${locale}-${viewportName}-${route.key}.png`);
            mkdirSync(dirname(screenshotPath), { recursive: true });
            await page.screenshot({ path: screenshotPath, fullPage: screenshotFullPage }).catch(() => {});
            result.screenshot = screenshotPath;
          }
          await page.close();
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

const findings = results.filter((result) => result.issues.length > 0);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ baseURL, results, findings }, null, 2)}\n`);
console.log(`Responsive audit: ${results.length} renders, ${findings.length} findings.`);
for (const finding of findings) {
  console.log(`FAIL ${finding.engine}/${finding.locale}/${finding.viewport}/${finding.route}: ${finding.issues.join('; ')}`);
}
console.log(`Responsive audit report: ${outputPath}`);
if (findings.length > 0) process.exitCode = 1;
