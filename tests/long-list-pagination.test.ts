import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('owned edition picker pagination', () => {
  const picker = source('src/components/OwnedEditionsSection.tsx');

  it('windows filtered releases before rendering edition cards', () => {
    expect(picker).toContain('const EDITION_PICKER_PAGE_SIZE = 40');
    expect(picker).toContain('const visibleReleases = filtered.slice(pageStart, pageEnd)');
    expect(picker).toContain('visibleReleases.map((r)');
    expect(picker).not.toContain('filtered.slice(0, 100)');
  });

  it('resets paging after any picker filter changes', () => {
    expect(picker).toContain('setPage(1);');
    expect(picker).toContain('[search, filterLang, filterPlatform, filterOfficial, filterEro, filterMtl]');
  });
});

describe('stock offer group pagination', () => {
  const stock = source('src/components/StockPanel.tsx');

  it('renders only the active offer page for each group', () => {
    expect(stock).toContain('const STOCK_OFFER_PAGE_SIZE = 12');
    expect(stock).toContain('const visibleOffers = offers.slice(pageStart, pageEnd)');
    expect(stock).toContain('visibleOffers.map((offer)');
    expect(stock).not.toContain('{offers.map((offer)');
  });

  it('keeps group count and expansion labels semantic', () => {
    expect(stock).toContain('t.stock.groupOfferCount');
    expect(stock).toContain('t.stock.groupExpandLabel');
    expect(stock).toContain('t.stock.groupCollapseLabel');
    expect(stock).toContain('aria-expanded={!collapsed}');
  });
});

describe('long list pagination translations', () => {
  const dictionaries = source('src/lib/i18n/dictionaries.ts');

  it('defines picker and stock pagination labels in each locale', () => {
    expect(dictionaries.match(/pickerPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/groupPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/groupOfferCount:/g)).toHaveLength(3);
  });
});
