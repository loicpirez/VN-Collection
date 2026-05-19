#!/usr/bin/env node
/**
 * Frontend regression sentinel — fast targeted checks against the
 * critical public-facing routes so an accidental refactor cannot
 * silently delete a feature.
 *
 * NOT a full QA gate. NOT a replacement for `yarn qa` /
 * `yarn qa:interactions`. The sentinel only:
 *   - hits each route at `${BASE}` (default `http://localhost:3000`)
 *   - asserts a small set of structural / textual contracts
 *   - exits non-zero on any failure with a one-line message per check
 *
 * Usage:
 *   node scripts/frontend-regression-sentinel.mjs
 *   BASE=http://localhost:3000 node scripts/frontend-regression-sentinel.mjs
 *
 * Designed to run against the operator's already-running dev server
 * (no spawn, no DB mutation, no token, no real writes). If you point
 * it at a clean `.qa` server you'll get fewer hits but the sentinel
 * is permissive about "data not present yet" — missing rows count as
 * "page rendered the empty-state surface", not as a failure, as long
 * as the structural assertions still hold.
 *
 * Rule of engagement: any check that fails here MUST be investigated
 * before continuing TODO work. The point of the sentinel is to catch
 * the kind of regression that has already cost a working VNDB tag
 * tree once — we don't get to claim "the refactor was safe" without
 * the sentinel still passing afterwards.
 */
import process from 'node:process';

const BASE = process.env.BASE ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
/** @type {{route: string; check: string; reason: string}[]} */
const failures = [];

async function fetchHtml(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'accept': 'text/html', 'accept-language': 'fr-FR' },
  });
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return res.text();
}

/**
 * @param {string} route
 * @param {string} name
 * @param {boolean} cond
 * @param {string} [reason]
 */
function assert(route, name, cond, reason = '') {
  if (cond) {
    passed += 1;
    return;
  }
  failed += 1;
  failures.push({ route, check: name, reason });
}

function contains(html, needle) {
  return html.includes(needle);
}

function matchesAny(html, needles) {
  return needles.some((n) => html.includes(n));
}

async function checkTagsBrowser() {
  const route = '/tags?mode=vndb';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  // The five canonical group labels VNDB serves on /g — must all
  // appear in the rendered tree. Tracks the R5-049 invariant.
  for (const label of ['Theme', 'Character', 'Style', 'Plot', 'Setting']) {
    assert(route, `group "${label}" visible`, contains(html, label));
  }
  // At least one child tag chip (rendered by TreeTagChip via /tag/<id> href).
  assert(route, 'at least one child tag chip', /href="\/tag\/g\d+/.test(html));
  // Many child chips, not just one — proves the hierarchy is
  // expanded, not collapsed to a single fallback link.
  const chipCount = (html.match(/href="\/tag\/g\d+/g) ?? []).length;
  assert(route, 'tree expands to many tag chips', chipCount > 10, `chip count=${chipCount}`);
  // R5-051: the rendered DOM must not show the actual empty-state
  // container. The bare i18n string `Aucun résultat` leaks into the
  // hydration JSON for every Locale, so we match on the DOM class
  // chain the empty branch uses (`py-12 text-center text-muted` from
  // TagsBrowser).
  assert(
    route,
    'no visible empty-state container when tree is expected',
    !html.includes('class="py-12 text-center text-muted"'),
    'empty-state DOM container appeared inside VNDB-tree mode',
  );
}

async function checkTagDetail() {
  const route = '/tag/g2?tab=vndb';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  // VNDB hierarchy block: breadcrumb / category / properties / child tags.
  assert(
    route,
    'category or properties chip visible',
    matchesAny(html, ['Catégorie', 'Category', 'Propriétés', 'Properties', 'cat_cont', 'cat_ero', 'cat_tech']),
  );
  assert(
    route,
    'child-tags section visible',
    matchesAny(html, ['Child tags', 'Tags enfants']),
  );
  // VNDB results list (under "Top VNs") — either a result grid, an
  // explicit empty/error message, or a skeleton (Suspense fallback).
  assert(
    route,
    'VN results / loading / explicit empty state visible',
    matchesAny(html, ['Top VNs', 'Meilleurs VN', 'aria-busy="true"', 'Aucun résultat', 'no results']),
  );
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
}

async function checkVnDetail() {
  const route = '/vn/v26180';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  // VN page must have a toolbar, a cover region, and a media gallery
  // (or at least the section anchors). Soft check: page must be
  // non-trivial in size to be considered intact.
  assert(route, 'page not blank', html.length > 6000, `body bytes=${html.length}`);
  // Toolbar / btn class chain — common to every VN action button.
  assert(route, 'btn class chain present', contains(html, 'class="btn') || contains(html, 'btn btn-'));
  // No horizontal-overflow markers we know about (CSS class `overflow-x`
  // applied to body or root is a red flag for the regression).
  assert(
    route,
    'no body-level overflow-x-scroll regression',
    !/<body[^>]*overflow-x-scroll/.test(html),
  );
}

async function checkUpcoming() {
  const route = '/upcoming';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  // Cards exist OR an explicit empty-state.
  assert(
    route,
    'card grid OR explicit empty state',
    matchesAny(html, ['grid-cols', 'aspect-[2/3]', 'Aucun', 'No upcoming']),
  );
}

async function checkCharacters() {
  const route = '/characters';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  assert(route, 'search input present', contains(html, 'type="search"'));
  // Tab strip must be present (Local / VNDB / Combined).
  assert(
    route,
    'tab strip present',
    matchesAny(html, ['aria-current', 'role="tab"', 'tabLocal']),
  );
}

async function checkStaff() {
  const route = '/staff';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  assert(route, 'search input present', contains(html, 'type="search"'));
}

async function checkRecommendations() {
  const route = '/recommendations';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  // A real card area OR an explicit picker-first empty state.
  assert(
    route,
    'card grid OR seed-picker shell',
    matchesAny(html, ['data-testid="vn-seed-picker"', 'aspect-[2/3]', 'grid-cols']),
  );
}

async function checkShelf() {
  const route = '/shelf';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  // Shelf controls / layout markers.
  assert(
    route,
    'shelf controls present',
    matchesAny(html, ['shelf', 'Shelf']),
  );
}

async function checkEgs() {
  const route = '/egs';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 4000, `body bytes=${html.length}`);
  // EGS card grid OR empty state.
  assert(
    route,
    'card grid OR empty state',
    matchesAny(html, ['grid-cols', 'aspect-[2/3]', 'Aucun', 'no results']),
  );
}

async function checkActivity() {
  const route = '/activity';
  const html = await fetchHtml(route).catch((e) => {
    assert(route, 'route reachable', false, e.message);
    return '';
  });
  if (!html) return;
  assert(route, 'page not blank', html.length > 3000, `body bytes=${html.length}`);
}

async function main() {
  console.log(`Frontend regression sentinel — BASE=${BASE}`);
  // Each route is independent — run sequentially so the failure
  // lines stay readable.
  await checkTagsBrowser();
  await checkTagDetail();
  await checkVnDetail();
  await checkUpcoming();
  await checkCharacters();
  await checkStaff();
  await checkRecommendations();
  await checkShelf();
  await checkEgs();
  await checkActivity();

  console.log('');
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  if (failed > 0) {
    console.log('');
    for (const f of failures) {
      console.log(`  ✗ ${f.route} — ${f.check}${f.reason ? `  (${f.reason})` : ''}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('sentinel: unexpected error:', e);
  process.exit(2);
});
