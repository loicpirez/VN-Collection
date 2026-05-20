/**
 * R5-156 pin: page-navigation chip strips that route to a
 * different URL state (full page render with new searchParams)
 * MUST NOT carry `role="tab"` / `role="tablist"` /
 * `aria-selected`. ARIA's tablist pattern requires matching
 * `role="tabpanel"` siblings — these strips have none, so the
 * mark-up misled screen readers into announcing the strip as
 * an in-view tabset.
 *
 * Affected routes (per the R5-156 row's inventory):
 *   - /dumped — `?tab=…` route filter
 *   - /recommendations — `?mode=…` route filter
 *   - /top-ranked — `?tab=…` route filter
 *   - /staff — `?tab=…` + `?scope=…` route filters
 *   - /characters — `?tab=…` route filter
 *   - /tag/[id] — `?tab=…` route filter
 *
 * The fix is consistent: the strip becomes a plain `<nav>` (no
 * `role="tablist"`) with `<Link>` elements that use
 * `aria-current="page"` to mark the active route.
 *
 * In-place tablists (SettingsButton, BannerSourcePicker,
 * CoverSourcePicker, FieldCompare, ShelfLayoutEditor,
 * SearchClient) are out of scope — those switch content WITHIN
 * the current view and legitimately need tablist semantics.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const SURFACES = [
  'src/app/dumped/page.tsx',
  // ModeTabs extracted to a client component; check the component file.
  'src/components/RecommendModeTabs.tsx',
  'src/app/top-ranked/page.tsx',
  'src/app/staff/page.tsx',
  'src/app/characters/page.tsx',
  'src/app/tag/[id]/page.tsx',
];

function stripJsxComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

describe('R5-156 — no role="tab" / role="tablist" misuse on navigation strips', () => {
  for (const rel of SURFACES) {
    it(`${rel} drops role="tab" + role="tablist" + aria-selected on URL-state navs`, () => {
      const code = stripJsxComments(readFileSync(join(ROOT, rel), 'utf8'));
      expect(code, `${rel} should not declare role="tab"`).not.toMatch(/role="tab"/);
      expect(code, `${rel} should not declare role="tablist"`).not.toMatch(/role="tablist"/);
      expect(code, `${rel} should not declare aria-selected on nav links`).not.toMatch(/aria-selected=/);
      // Positive: the active link is announced via aria-current.
      expect(code, `${rel} should use aria-current="page" on the active nav link`).toMatch(/aria-current=/);
    });
  }
});
