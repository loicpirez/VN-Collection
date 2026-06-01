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

describe('stock batch queue pagination', () => {
  const client = source('src/components/StockBatchClient.tsx');
  const route = source('src/app/api/stock/queue/route.ts');

  it('bounds scope responses and editable queue size', () => {
    expect(route).toContain('const MAX_PAGE_SIZE = 500');
    expect(route).toContain('LIMIT ? OFFSET ?');
    expect(client).toContain('const STOCK_BATCH_QUEUE_CAP = 5000');
    expect(client).toContain('const STOCK_BATCH_SCOPE_PAGE_SIZE = 500');
  });

  it('renders only the active editable queue page', () => {
    expect(client).toContain('const STOCK_BATCH_QUEUE_PAGE_SIZE = 50');
    expect(client).toContain('const visibleQueue = queue.slice(');
    expect(client).toContain('{visibleQueue.map((entry)');
    expect(client).not.toContain('{queue.map((entry)');
  });
});

describe('physical stock branch pagination', () => {
  const physical = source('src/components/StockPhysicalLocations.tsx');

  it('windows branch groups before rendering physical-store cards', () => {
    expect(physical).toContain('const PHYSICAL_BRANCH_PAGE_SIZE = 8');
    expect(physical).toContain('const visibleGroups = grouped.slice(pageStart, pageEnd)');
    expect(physical).toContain('visibleGroups.map(({ branch, offers: branchOffers })');
    expect(physical).not.toContain('{grouped.map(({ branch, offers: branchOffers })');
  });

  it('exposes localized page navigation for long physical-store lists', () => {
    expect(physical).toContain('t.stock.physicalPaginationLabel');
    expect(physical).toContain('t.stock.previousPage');
    expect(physical).toContain('t.stock.nextPage');
  });
});

describe('long list pagination translations', () => {
  const dictionaries = source('src/lib/i18n/dictionaries.ts');

  it('defines picker and stock pagination labels in each locale', () => {
    expect(dictionaries.match(/pickerPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/groupPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/groupOfferCount:/g)).toHaveLength(3);
    expect(dictionaries.match(/batchQueuePaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/batchQueueCapacity:/g)).toHaveLength(3);
    expect(dictionaries.match(/physicalPaginationLabel:/g)).toHaveLength(3);
  });
});
