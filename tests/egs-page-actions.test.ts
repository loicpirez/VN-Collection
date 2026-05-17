/**
 * Source-pin contract for the `/egs` page UX deepening:
 *   - Upstream loads are wrapped in try/catch + the error band is mounted.
 *   - Skeleton fallback is wired via Suspense.
 *   - Per-card source status chips are rendered with the canonical labels.
 *   - Linked + unlinked cards expose the required affordances
 *     (open VN, map-to-vndb, open EGS).
 *
 * Static source scan only. Affordances are tagged with `data-egs-action`
 * and chips with `data-egs-status-chip` so the test matches by literal
 * attribute strings.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE_SRC = readFileSync('src/app/egs/page.tsx', 'utf8');

describe('/egs page UX deepening', () => {
  it('wraps the DB load in try/catch + surfaces a clear error band', () => {
    expect(PAGE_SRC).toMatch(/function loadEgsPageData\(\)[\s\S]*?try\s*\{[\s\S]*?\}\s*catch/);
    expect(PAGE_SRC).toMatch(/role="alert"/);
    expect(PAGE_SRC).toMatch(/errorBandTitle/);
  });

  it('uses a Suspense skeleton fallback during load', () => {
    expect(PAGE_SRC).toMatch(/<Suspense\b/);
    expect(PAGE_SRC).toMatch(/SkeletonCardGrid|SkeletonRows/);
  });

  it('renders a per-card status chip with the canonical source vocabulary', () => {
    expect(PAGE_SRC).toMatch(/data-egs-status-chip/);
    // Source-label keys all four canonical states.
    expect(PAGE_SRC).toMatch(/sourceExtlink/);
    expect(PAGE_SRC).toMatch(/sourceAuto/);
    expect(PAGE_SRC).toMatch(/sourceManual/);
    expect(PAGE_SRC).toMatch(/sourceNone/);
  });

  it('mounts open-VN, map-to-VNDB, and open-EGS affordances on the cards', () => {
    expect(PAGE_SRC).toMatch(/data-egs-action="open-egs"/);
    expect(PAGE_SRC).toMatch(/data-egs-action="remap"/);
    expect(PAGE_SRC).toMatch(/data-egs-action="map-vn-to-egs"/);
    // Open-VN affordance is the internal Link wrapper on the card body.
    expect(PAGE_SRC).toMatch(/href={`\/vn\/\$\{[lu]\.vn_id\}`}/);
  });

  it('keeps the empty-state copy informative (not a bare "nothing here")', () => {
    expect(PAGE_SRC).toMatch(/linkedEmptyHint/);
  });
});
