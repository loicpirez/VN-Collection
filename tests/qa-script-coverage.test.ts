/**
 * R5-047 / R5-179..R5-190 pin: `scripts/browser-qa.sh` is real
 * DOM-shape QA gated on `.qa` isolation, and
 * `scripts/browser-interactions.mjs` is real Playwright /
 * browser-automation QA covering every interaction surface the
 * row list cites.
 *
 * The check is forward-looking: any future regression that
 * removes the `chromium` import, drops a check, or loosens the
 * `.qa` gate trips this test.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const QA_SH = readFileSync(join(ROOT, 'scripts/browser-qa.sh'), 'utf8');
const INTERACTIONS = readFileSync(
  join(ROOT, 'scripts/browser-interactions.mjs'),
  'utf8',
);
const RESPONSIVE = readFileSync(
  join(ROOT, 'scripts/responsive-audit.mjs'),
  'utf8',
);

describe('R5-179 — yarn qa is DOM QA gated on .qa', () => {
  it('script defaults to PORT=3100 (the isolated QA server)', () => {
    expect(QA_SH).toMatch(/PORT="\$\{PORT:-3100\}"/);
  });

  it('script refuses to run when DB_PATH points at the real data/collection.db', () => {
    expect(QA_SH).toMatch(/refusing to run: DB_PATH explicitly points at the real/);
  });

  it('script refuses WRITE_QA_ALLOWED=1 without isolated DB_PATH + STORAGE_ROOT', () => {
    expect(QA_SH).toMatch(/WRITE_QA_ALLOWED=1 with DB_PATH unset/);
    expect(QA_SH).toMatch(/WRITE_QA_ALLOWED=1 with STORAGE_ROOT unset/);
  });

  it('script runs DOM-shape assertions (grep -P / curl pattern, not bare word grep)', () => {
    expect(QA_SH).toMatch(/curl\b/);
    expect(QA_SH).toMatch(/grep -P\b|grep -E\b/);
  });

  it('keeps fetch failures in the parent shell and never concatenates fallback status codes', () => {
    expect(QA_SH).toContain('FETCH_HTML_RESULT=""');
    expect(QA_SH).toContain('if fetch_html "/vn/$IN_VN"; then');
    expect(QA_SH).not.toMatch(/\$\(\s*fetch_html/);
    expect(QA_SH).not.toContain('|| echo "000"');
    expect(QA_SH).toContain('code="${code:-000}"');
    expect(QA_SH).toContain('SETTINGS_CODE="${SETTINGS_CODE:-000}"');
  });

  it('rejects truncated HTTP responses and prefers a character fixture with a description', () => {
    expect(QA_SH).toContain('QA_HTTP_TIMEOUT="${QA_HTTP_TIMEOUT:-60}"');
    expect(QA_SH).toMatch(/if ! code=\$\(curl[\s\S]*--max-time "\$QA_HTTP_TIMEOUT"/);
    expect(QA_SH).toContain('did not complete within %ss');
    expect(QA_SH).toContain("'$.profile.description'");
  });

  it('treats optional cached staff gender as fixture-dependent DOM', () => {
    expect(QA_SH).toContain('GENDER_CHIP_HITS=$(count_pattern "$STAFF_HTML"');
    expect(QA_SH).toContain('gender chip absent (no gender in cached VNDB payload)');
  });
});

describe('R5-180 — yarn qa:interactions is real Playwright', () => {
  it('imports chromium from playwright', () => {
    expect(INTERACTIONS).toMatch(/from\s+['"]playwright['"]/);
    expect(INTERACTIONS).toMatch(/chromium\.launch/);
  });

  it('uses page.click / page.evaluate / locator (real browser automation)', () => {
    expect(INTERACTIONS).toMatch(/page\.(click|evaluate|locator|hover|keyboard|goto)/);
  });

  it('refuses to run without VNCOLL_QA + WRITE_QA_ALLOWED + .qa-rooted DB_PATH', () => {
    expect(INTERACTIONS).toMatch(/WRITE_QA_ALLOWED=1 is required/);
    expect(INTERACTIONS).toMatch(/VNCOLL_QA=1 is required/);
    expect(INTERACTIONS).toMatch(/refusing DB_PATH/);
    expect(INTERACTIONS).toMatch(/HTTP QA server still enforces upgrade-insecure-requests/i);
  });

  it('waits for the streamed route skeleton to leave before asserting page content', () => {
    expect(INTERACTIONS).toContain(':scope > .page-space-frame > [role="status"][aria-busy="true"]');
    expect(INTERACTIONS).toContain("routeLoadingBoundary.waitFor({ state: 'detached', timeout: 30000 })");
    expect(INTERACTIONS.indexOf("url.pathname === '/upcoming'")).toBeLessThan(
      INTERACTIONS.indexOf("getByRole('heading', { name: /Sorties à venir"),
    );
  });

  it('moves bounded shelf sliders in either direction and restores the initial value', () => {
    expect(INTERACTIONS).toContain("getPropertyValue('--shelf-cell-w-px').trim().length > 0");
    expect(INTERACTIONS).toContain('current + step * 4 <= max');
    expect(INTERACTIONS).toContain('Math.max(min, current - step * 4)');
    expect(INTERACTIONS).toContain('await slider.fill(String(current))');
  });

  it('waits for AliceNet hydration and searches a character id selected from live QA results', () => {
    expect(INTERACTIONS).toContain('await waitForEnabled(downloadAll)');
    expect(INTERACTIONS).toContain('const characterId = characterHref?.match');
    expect(INTERACTIONS).toContain('encodeURIComponent(characterId)');
    expect(INTERACTIONS).toContain('url.pathname === `/character/${characterId}`');
  });
});

describe('responsive audit matrix', () => {
  it('covers the full route inventory across all three browser engines and five viewport classes', () => {
    expect(RESPONSIVE).toContain('const expectedPageCount = 40');
    expect(RESPONSIVE).toContain('chromium,');
    expect(RESPONSIVE).toContain('firefox,');
    expect(RESPONSIVE).toContain('webkit,');
    for (const viewport of ['narrow', 'phone', 'landscape', 'tablet', 'desktop']) {
      expect(RESPONSIVE).toContain(`${viewport}: {`);
    }
  });

  it('keeps recovered local-image failures visible without treating them as blocking errors', () => {
    expect(RESPONSIVE).toContain("document.querySelectorAll('[data-safe-image-fallback-from]')");
    expect(RESPONSIVE).toContain('recoveredBrowserErrors: classifiedErrors.recovered');
    expect(RESPONSIVE).toContain('error === `HTTP 404 ${url}`');
  });

  it('supports exhaustive visual capture without weakening finding collection', () => {
    expect(RESPONSIVE).toContain("RESPONSIVE_SCREENSHOTS ?? 'findings'");
    expect(RESPONSIVE).toContain("['all', 'findings', 'none'].includes(screenshotMode)");
    expect(RESPONSIVE).toContain("screenshotMode === 'all'");
    expect(RESPONSIVE).toContain('fullPage: screenshotFullPage');
  });

  it('keeps HTTP and Basic Auth audit diagnostics deterministic', () => {
    expect(RESPONSIVE.match(/if \(result\.status !== 200\) issues\.push/g)).toHaveLength(1);
    expect(RESPONSIVE).toContain("send: 'always'");
    expect(RESPONSIVE).toContain('response?.status() === 200');
    expect(RESPONSIVE).toContain('`HTTP 401 ${recoveredNavigationUrl}`');
    expect(RESPONSIVE).toContain('error === recoveredBasicChallenge');
  });

  it('exercises the real two-column compact library state on phone viewports', () => {
    expect(RESPONSIVE).toContain("density: { library: 160 }");
    expect(RESPONSIVE).toContain("result.route === 'library' && result.viewport === 'phone'");
    expect(RESPONSIVE).toContain('result.cardColumnCount < 2');
    expect(RESPONSIVE).toContain('library row offset');
    expect(RESPONSIVE).toContain('cardVisibleBottomOffset');
    expect(RESPONSIVE).toContain('library visible card bottom offset');
    expect(RESPONSIVE).toContain("item.matches('[data-vn-card]')");
    expect(RESPONSIVE).not.toContain('card.firstElementChild?.getBoundingClientRect().bottom');
    expect(RESPONSIVE).toContain("issues.push('quote panel is not full-width on touch')");
  });

  it('captures the persisted collapsed map privacy state', () => {
    expect(RESPONSIVE).toContain(
      "localStorage.setItem('vncoll.map.privacy-notice-dismissed.v1', 'true')",
    );
    expect(RESPONSIVE).not.toContain('vn_map_privacy_dismissed_v1');
  });
});

describe('R5-181..R5-190 + R5-047 — interactions.mjs covers each cited surface', () => {
  const CHECKS = [
    {
      row: 'R5-181 crash routes',
      pattern: /check\('detail pages do not crash across RSC boundary'/,
    },
    {
      row: 'R5-182 toolbar bbox',
      pattern: /check\('\/vn\/v[0-9]+ toolbar buttons have consistent height'/,
    },
    {
      row: 'R5-183 cover/media controls',
      pattern: /check\('cover rotation clicks change visible transform/,
    },
    {
      row: 'R5-183 cover/media controls (media menu)',
      pattern: /check\('media action menu opens in a portal/,
    },
    {
      row: 'R5-184 spoilers on VN routes',
      pattern: /check\('\/vn\/v[0-9]+ spoiler hover reveals text/,
    },
    {
      row: 'R5-185 tag tree + pagination',
      pattern: /check\('VNDB tag hierarchy skeleton, tree, click routing/,
    },
    {
      row: 'R5-185 tag pagination (detail page)',
      pattern: /check\('\/tag\/\[id\]\?tab=vndb pagination/,
    },
    {
      row: 'R5-186 character/staff tabs + filters',
      pattern: /check\('character and staff filters browse actual results'/,
    },
    {
      row: 'R5-187 recommendations',
      pattern: /check\('recommendation seed picker updates URL/,
    },
    {
      row: 'R5-187 recommendations cards',
      pattern: /check\('\/recommendations first card has cover/,
    },
    {
      row: 'R5-188 shelf controls',
      pattern: /check\('shelf display controls change rendered CSS variables'/,
    },
    {
      row: 'R5-189 settings/data/loading',
      pattern: /check\('settings modal tabs are reachable and non-empty'/,
    },
    {
      row: 'R5-189 section layout',
      pattern: /check\('section layout controls hide\/collapse and save/,
    },
    {
      row: 'R5-190 EGS layout',
      pattern: /check\('EGS cards do not overflow desktop viewport'/,
    },
    {
      row: 'R5-047 SpoilerReveal covered',
      pattern: /check\('spoiler hover and click reveal text without opaque block'/,
    },
    {
      row: 'TESTA-007 narrow tutorial placement and touch targets',
      pattern: /check\('narrow tutorial panel stays inside viewport with touch-safe actions'/,
    },
    {
      row: 'TESTA-007 bounded narrow VN detail and section navigation',
      pattern: /check\('narrow VN detail stays bounded with collapsed sections and touch-safe navigation'/,
    },
    {
      row: 'R14-RESP-005 Chromium quote dock touch behavior',
      pattern: /check\('Chromium mobile quote dock stays fixed and toggles reversibly'/,
    },
  ];

  for (const { row, pattern } of CHECKS) {
    it(`${row} — interactions.mjs contains the matching check`, () => {
      expect(INTERACTIONS).toMatch(pattern);
    });
  }
});
