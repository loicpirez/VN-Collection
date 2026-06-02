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

describe('wishlist card pagination', () => {
  const wishlist = source('src/components/WishlistClient.tsx');

  it('windows sorted wishlist rows before grouping and card rendering', () => {
    expect(wishlist).toContain('const WISHLIST_PAGE_SIZE = 60');
    expect(wishlist).toContain('const pageItems = useMemo(');
    expect(wishlist).toContain('() => sorted.slice(pageStart, pageStart + WISHLIST_PAGE_SIZE)');
    expect(wishlist).toContain("if (group === 'none') return [{ key: '', items: pageItems }]");
    expect(wishlist).toContain('for (const it of pageItems)');
  });

  it('exposes URL-backed localized page navigation for long wishlists', () => {
    expect(wishlist).toContain("const requestedPage = readPageFromUrl(search?.get('page') ?? null)");
    expect(wishlist).toContain("if (key !== 'page') sp.delete('page')");
    expect(wishlist).toContain('aria-label={t.wishlist.paginationLabel}');
    expect(wishlist).toContain('{t.wishlist.previousPage}');
    expect(wishlist).toContain('{t.wishlist.nextPage}');
  });
});

describe('staff credit pagination', () => {
  const grid = source('src/components/PaginatedGrid.tsx');
  const detail = source('src/app/staff/[id]/page.tsx');
  const extra = source('src/components/StaffExtraCredits.tsx');

  it('bounds staff grids while keeping rows reachable', () => {
    expect(grid).toContain('pageSize = 60');
    expect(grid).toContain('const visibleItems = items.slice(pageStart, pageStart + pageSize)');
    expect(detail).toContain('resetKey={`${id}:voice`}');
    expect(detail).toContain('resetKey={`${id}:production:${g.role}`}');
    expect(extra).toContain('resetKey={`${sid}:extra-voice`}');
    expect(extra).toContain('resetKey={`${sid}:extra-production`}');
  });
});

describe('shared detail-card pagination', () => {
  const dumped = source('src/app/dumped/page.tsx');
  const lists = source('src/app/lists/[id]/page.tsx');
  const series = source('src/app/series/[id]/page.tsx');
  const producer = source('src/components/ProducerVnsSections.tsx');

  it('bounds other image-heavy detail grids with the shared paginator', () => {
    expect(dumped).toContain('resetKey={tab}');
    expect(lists).toContain('resetKey={`list:${list.id}`}');
    expect(series).toContain('resetKey={`series:${series.id}`}');
    expect(producer).toContain('resetKey={title}');
  });
});

describe('place stock VN pagination', () => {
  const browser = source('src/components/PlaceVnBrowser.tsx');

  it('windows sorted place-stock rows before grouping and rendering', () => {
    expect(browser).toContain('const PLACE_VN_PAGE_SIZE = 60');
    expect(browser).toContain('() => sorted.slice(pageStart, pageStart + PLACE_VN_PAGE_SIZE)');
    expect(browser).toContain("if (group === 'none') return [{ key: '', items: pageItems }]");
    expect(browser).toContain('for (const vn of pageItems)');
    expect(browser).toContain('t.places.vnPaginationLabel');
  });
});

describe('place registry pagination', () => {
  const browser = source('src/components/PlaceBrowser.tsx');

  it('windows filtered places and unassigned branches before rendering', () => {
    expect(browser).toContain('const PLACE_REGISTRY_PAGE_SIZE = 60');
    expect(browser).toContain('const visiblePlaces = filtered.slice(pageStart, pageStart + PLACE_REGISTRY_PAGE_SIZE)');
    expect(browser).toContain('const visibleUnassigned = filteredUnassigned.slice(pageStart, pageStart + PLACE_REGISTRY_PAGE_SIZE)');
    expect(browser).toContain('visiblePlaces.map((place)');
    expect(browser).toContain('visibleUnassigned.map((branch)');
    expect(browser).toContain('t.places.registryPaginationLabel');
  });
});

describe('character detail pagination', () => {
  const detail = source('src/app/character/[id]/page.tsx');

  it('bounds image-heavy sibling and VN appearance grids', () => {
    expect(detail).toContain("import { PaginatedGrid } from '@/components/PaginatedGrid'");
    expect(detail).toContain('resetKey={`${id}:siblings`}');
    expect(detail).toContain('resetKey={`${id}:appears-in`}');
  });
});

describe('VN route journal pagination', () => {
  const routes = source('src/components/RoutesSection.tsx');

  it('windows interactive route rows while preserving complete-list reorder boundaries', () => {
    expect(routes).toContain('const ROUTES_PAGE_SIZE = 40');
    expect(routes).toContain('const visibleRoutes = routes.slice(pageStart, pageEnd)');
    expect(routes).toContain('visibleRoutes.map((r, i)');
    expect(routes).toContain('routeIndex === 0');
    expect(routes).toContain('routeIndex === routes.length - 1');
    expect(routes).not.toContain('{routes.map((r, i)');
  });

  it('exposes localized route-journal page navigation', () => {
    expect(routes).toContain('t.routes.paginationLabel');
    expect(routes).toContain('t.routes.pageRange');
    expect(routes).toContain('t.common.prev');
    expect(routes).toContain('t.common.next');
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
    expect(dictionaries.match(/paginationLabel: '.*[Ww]ishlist|paginationLabel: 'ウィッシュリスト/g)).toHaveLength(3);
    expect(dictionaries.match(/creditsPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/vnPaginationLabel:/g)).toHaveLength(3);
    expect(dictionaries.match(/registryPaginationLabel:/g)).toHaveLength(3);
  });
});
