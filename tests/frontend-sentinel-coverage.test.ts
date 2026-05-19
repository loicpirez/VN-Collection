/**
 * Pins the route list + structural assertions of
 * `scripts/frontend-regression-sentinel.mjs`. Source-pin only — the
 * sentinel itself runs against a live dev server so we don't repeat
 * its work in vitest, but losing a route or check from the script
 * must fail this suite so the regression guard cannot quietly drop
 * coverage.
 *
 * If a route is intentionally retired, the EXPECTED list below must
 * be updated in the same change. That makes the trade-off visible in
 * code review.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SENTINEL = readFileSync(join(ROOT, 'scripts/frontend-regression-sentinel.mjs'), 'utf8');

const EXPECTED_ROUTES = [
  '/tags?mode=vndb',
  '/tag/g2?tab=vndb',
  '/vn/v26180',
  '/upcoming',
  '/characters',
  '/staff',
  '/recommendations',
  '/shelf',
  '/egs',
  '/activity',
] as const;

describe('frontend-regression-sentinel — script covers every critical route', () => {
  for (const route of EXPECTED_ROUTES) {
    it(`covers ${route}`, () => {
      expect(SENTINEL).toContain(`'${route}'`);
    });
  }
});

describe('frontend-regression-sentinel — runtime contract', () => {
  it('reads BASE from env (not a hardcoded production URL)', () => {
    expect(SENTINEL).toMatch(/process\.env\.BASE/);
  });

  it('exits non-zero on failure', () => {
    expect(SENTINEL).toMatch(/process\.exit\(1\)/);
  });

  it('exits 2 on unexpected error so CI / cron can distinguish flakes', () => {
    expect(SENTINEL).toMatch(/process\.exit\(2\)/);
  });
});

describe('frontend-regression-sentinel — per-route check functions', () => {
  const CHECKS = [
    'checkTagsBrowser',
    'checkTagDetail',
    'checkVnDetail',
    'checkUpcoming',
    'checkCharacters',
    'checkStaff',
    'checkRecommendations',
    'checkShelf',
    'checkEgs',
    'checkActivity',
  ] as const;
  for (const fn of CHECKS) {
    it(`defines ${fn}`, () => {
      expect(SENTINEL).toMatch(new RegExp(`function ${fn}\\b`));
    });
  }
});

describe('frontend-regression-sentinel — VNDB tree invariants', () => {
  it('asserts every canonical VNDB tag-tree group label', () => {
    for (const label of ['Theme', 'Character', 'Style', 'Plot', 'Setting']) {
      expect(SENTINEL).toContain(`'${label}'`);
    }
  });

  it('asserts the tree expands to many child chips (not a single fallback)', () => {
    expect(SENTINEL).toMatch(/tree expands to many tag chips/);
  });

  it('asserts the rendered empty-state DOM is absent when the tree is expected', () => {
    expect(SENTINEL).toMatch(/no visible empty-state container when tree is expected/);
  });
});

describe('frontend-regression-sentinel — tag detail invariants', () => {
  it('asserts the category/properties chip is visible', () => {
    expect(SENTINEL).toMatch(/category or properties chip visible/);
  });

  it('asserts the child-tags section is visible', () => {
    expect(SENTINEL).toMatch(/child-tags section visible/);
  });
});
