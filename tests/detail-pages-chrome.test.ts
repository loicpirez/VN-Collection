/**
 * Source-pin contract for the visual chrome of detail pages.
 *
 * After the section-layout regression where character/staff/producer
 * pages flattened into generic admin-panel cards, we now pin the
 * rich-chrome elements: section panels (`rounded-xl` or `rounded-2xl`
 * + `bg-bg-card`), uppercase section labels with `tracking-widest`,
 * cover aspect-2/3 frames, and a real `<h1>` title.
 *
 * Source pin only — we don't render to DOM here. The Playwright /
 * browser-qa step is responsible for visual screenshot regression.
 * This test catches the deletion-by-refactor failure mode (someone
 * replacing `<section className="rounded-xl border border-border
 * bg-bg-card p-4 sm:p-6">` with `<div>`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

interface ChromeContract {
  rel: string;
  minRoundedCards: number;
  minBgBgCard: number;
  minTrackingWidest: number;
  requireH1: boolean;
}

const PAGES: ChromeContract[] = [
  // Character pages have the strongest chrome (header card + 4+
  // section cards + trait section + same-name siblings card).
  {
    rel: 'src/app/character/[id]/page.tsx',
    minRoundedCards: 4,
    minBgBgCard: 4,
    minTrackingWidest: 4,
    requireH1: true,
  },
  // Staff pages have a similar shape (header + production + voice +
  // extra credits). The exact card count is data-driven, so the
  // minimums are conservative.
  {
    rel: 'src/app/staff/[id]/page.tsx',
    minRoundedCards: 3,
    minBgBgCard: 3,
    minTrackingWidest: 2,
    requireH1: true,
  },
  // Producer pages historically had less chrome (header + body) so
  // tracking-widest is not strictly required here.
  {
    rel: 'src/app/producer/[id]/page.tsx',
    minRoundedCards: 2,
    minBgBgCard: 2,
    minTrackingWidest: 0,
    requireH1: true,
  },
];

describe('detail pages — visual chrome contract', () => {
  it.each(PAGES)('$rel keeps rich-chrome class invariants', (contract) => {
    const src = read(contract.rel);
    // `rounded-xl` and `rounded-2xl` both count as section-card
    // shells. Match either.
    const rounded = (src.match(/\brounded-(xl|2xl)\b/g) ?? []).length;
    expect(rounded, `${contract.rel} rounded-xl/2xl count`).toBeGreaterThanOrEqual(contract.minRoundedCards);

    const bgBgCard = (src.match(/\bbg-bg-card\b/g) ?? []).length;
    expect(bgBgCard, `${contract.rel} bg-bg-card count`).toBeGreaterThanOrEqual(contract.minBgBgCard);

    const trackingWidest = (src.match(/\btracking-widest\b/g) ?? []).length;
    expect(trackingWidest, `${contract.rel} tracking-widest count`).toBeGreaterThanOrEqual(contract.minTrackingWidest);

    if (contract.requireH1) {
      expect(src, `${contract.rel} <h1>`).toMatch(/<h1\b/);
    }
  });

  it.each(PAGES)('$rel does not flatten into generic admin chrome (no `.btn` drift)', (contract) => {
    const src = read(contract.rel);
    // Empty `class="btn "` / trailing space — the operator's
    // explicit drift signature.
    expect(src).not.toMatch(/class(Name)?=['"`]btn ['"`]/);
    // No useless `<span className="contents">` wrappers.
    expect(src).not.toMatch(/className=['"`]contents['"`]/);
  });
});
