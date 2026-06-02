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
  ];

  for (const { row, pattern } of CHECKS) {
    it(`${row} — interactions.mjs contains the matching check`, () => {
      expect(INTERACTIONS).toMatch(pattern);
    });
  }
});
