/**
 * R5-124 pin: `safeHref` rejects every non-http(s) URL form that
 * could turn a user-influenceable string into a clickable XSS or
 * exfil vector.
 *
 * Sweep — every dynamic extlink render surface flows through
 * `safeHref`:
 *   - `src/app/release/[id]/page.tsx` (.extlinks render)
 *   - `src/app/producer/[id]/page.tsx` (.extlinks render)
 *   - `src/app/staff/[id]/page.tsx` (.extlinks render)
 *   - `src/components/VnDetailActionsBar.tsx` (ExternalLinkGridItem)
 *   - `src/components/ReleasesSection.tsx` (.extlinks render)
 *
 * The source-pin asserts that each of those files imports
 * `safeHref` from `@/lib/safe-href` and calls it before emitting
 * an `<a href={...}>` from extlinks data.
 */
import { describe, expect, it } from 'vitest';
import { safeHref } from '@/lib/safe-href';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('safeHref — R5-124 behaviour', () => {
  it('returns the canonical URL for http and https', () => {
    expect(safeHref('https://vndb.org/v17')).toBe('https://vndb.org/v17');
    expect(safeHref('http://example.com/x')).toBe('http://example.com/x');
  });

  it('rejects javascript: vectors regardless of case / whitespace', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('  javascript:alert(1)  ')).toBeNull();
  });

  it('rejects data:, vbscript:, file:, ftp:', () => {
    expect(safeHref('data:text/html,<script>1</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox("x")')).toBeNull();
    expect(safeHref('file:///etc/passwd')).toBeNull();
    expect(safeHref('ftp://example.com')).toBeNull();
  });

  it('rejects relative / scheme-less inputs (the DOM would resolve them against the current page)', () => {
    // No scheme means `new URL(...)` throws — refuse to render.
    expect(safeHref('/etc/passwd')).toBeNull();
    expect(safeHref('vndb.org/v17')).toBeNull();
    expect(safeHref('//evil.com')).toBeNull();
  });

  it('rejects empty / null / non-string', () => {
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(safeHref(123 as any)).toBeNull();
  });
});

describe('safeHref — R5-124 sweep (extlink render surfaces import + call it)', () => {
  const surfaces = [
    'src/app/release/[id]/page.tsx',
    'src/app/producer/[id]/page.tsx',
    'src/app/staff/[id]/page.tsx',
    'src/components/VnDetailActionsBar.tsx',
    'src/components/ReleasesSection.tsx',
    'src/components/PlaceCard.tsx',
    'src/components/PlaceBrowser.tsx',
    'src/components/PlaceDetailClient.tsx',
    'src/components/StockPanel.tsx',
    'src/components/StockPhysicalLocations.tsx',
    'src/components/MediaGallery.tsx',
    'src/components/EgsPanel.tsx',
    'src/components/ErogePricePanel.tsx',
    'src/components/EgsRichDetails.tsx',
  ];

  for (const rel of surfaces) {
    it(`${rel} imports safeHref and emits <a href={safe...}>`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src).toMatch(/from\s+['"]@\/lib\/safe-href['"]/);
      expect(src).toMatch(/safeHref\(/);
    });
  }
});
