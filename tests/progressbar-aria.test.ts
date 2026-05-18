/**
 * R5-154 pin: every dynamic-width progress bar in the listed
 * surfaces (dumped, year, routes, bulk, timer) carries
 * `role="progressbar"` with `aria-valuenow` / `aria-valuemin` /
 * `aria-valuemax` and an `aria-label`. Screen readers therefore
 * announce the percentage as a real progress indicator instead
 * of as an unmarked decorative `<div>`.
 *
 * The list of touched surfaces matches the row's explicit
 * inventory:
 *   - dumped: `src/app/dumped/page.tsx` (page-level summary bar
 *     + per-VN dumped-edition bar)
 *   - year: `src/app/year/page.tsx` (reading-goal progress)
 *   - routes: `src/components/RoutesSection.tsx`
 *   - bulk: `src/components/BulkDownloadButton.tsx`,
 *     `src/components/BulkActionBar.tsx`
 *   - timer: `src/components/PomodoroTimer.tsx`,
 *     `src/components/ReadingGoalCard.tsx`
 *
 * The shape of the assertion is the same across every file:
 * the wrapping `<div>` (the track) must have
 * `role="progressbar"` and the four ARIA attributes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const SURFACES = [
  'src/app/dumped/page.tsx',
  'src/app/year/page.tsx',
  'src/components/RoutesSection.tsx',
  'src/components/BulkDownloadButton.tsx',
  'src/components/BulkActionBar.tsx',
  'src/components/PomodoroTimer.tsx',
  'src/components/ReadingGoalCard.tsx',
];

describe('R5-154 — progressbar ARIA attributes', () => {
  for (const rel of SURFACES) {
    it(`${rel} declares role="progressbar" with aria-value* attributes`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src, `${rel} should declare role="progressbar"`).toMatch(/role="progressbar"/);
      expect(src, `${rel} should declare aria-valuenow`).toMatch(/aria-valuenow=/);
      expect(src, `${rel} should declare aria-valuemin=\\{0\\}`).toMatch(/aria-valuemin=\{0\}/);
      expect(src, `${rel} should declare aria-valuemax=\\{100\\}`).toMatch(/aria-valuemax=\{100\}/);
      expect(src, `${rel} should declare an aria-label for the bar`).toMatch(/aria-label=/);
    });
  }
});
