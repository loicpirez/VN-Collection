import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DENSE_VN_LINK_SURFACES = [
  'src/app/brand-overlap/page.tsx',
  'src/app/recommendations/page.tsx',
  'src/app/similar/page.tsx',
  'src/app/staff/[id]/page.tsx',
  'src/app/tag/[id]/page.tsx',
  'src/app/top-ranked/page.tsx',
  'src/components/AnniversaryFeedView.tsx',
  'src/components/ListReorderGrid.tsx',
  'src/components/PlaceVnBrowser.tsx',
  'src/components/ProducerVnsSections.tsx',
  'src/components/QuoteFooter.tsx',
  'src/components/ReadingQueueStripView.tsx',
  'src/components/RecentlyViewedStrip.tsx',
  'src/components/ShelfLayoutEditor.tsx',
  'src/components/ShelfSpatialView.tsx',
  'src/components/StaffExtraCredits.tsx',
  'src/components/TextualSearchPanel.tsx',
  'src/components/VnCard.tsx',
] as const;

describe('VN detail prefetch policy', () => {
  it.each(DENSE_VN_LINK_SURFACES)('%s disables speculative VN detail renders', (file) => {
    const source = readFileSync(file, 'utf8');
    const vnLinks = source.match(/<Link\b(?:(?!>).)*href=\{`\/vn\/[^>]*>/gs) ?? [];

    expect(vnLinks.length).toBeGreaterThan(0);
    for (const link of vnLinks) {
      expect(link).toContain('prefetch={false}');
    }
  });
});
