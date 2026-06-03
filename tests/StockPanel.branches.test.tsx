// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPanel } from '@/components/StockPanel';
import type { StockOfferDto, StockProviderDto, StockSnapshotDto, StockStatusDto } from '@/lib/stock-api-types';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/ErogePricePanel', () => ({
  ErogePricePanel: ({ vnId }: { vnId: string }) => <div data-testid="eroge-panel">{vnId}</div>,
}));
vi.mock('@/components/StockPhysicalLocations', () => ({
  StockPhysicalLocations: ({ offers }: { offers: unknown[] }) => <div data-testid="physical-locations">{offers.length}</div>,
}));

const t = dictionaries[DEFAULT_LOCALE];

function offer(over: Partial<StockOfferDto> = {}): StockOfferDto {
  return {
    vn_id: 'v90001', provider: 'surugaya', provider_label: 'Studio X Shop', provider_offer_id: 'off-1',
    source: 'search', title: 'Title Y', url: 'https://example.test/o/1', price: 1980, currency: 'JPY',
    availability: 'in_stock', availability_label: null, condition: 'used', edition_label: null,
    location_label: null, location_branch: null, source_release_id: null, jan: null, fetched_at: Date.now(),
    error: null, content_kind: 'game_package', platform: 'PC', edition_kind: 'standard',
    series_relation: 'exact_game', match_confidence: 'high', match_score: 90, match_warnings_json: null,
    marketplace_price: null, marketplace_count: null, list_price: null, category: null, store_code: null,
    product_id: null, page_kind: null,
    ...over,
  };
}
function provider(over: Partial<StockProviderDto> = {}): StockProviderDto {
  return {
    id: 'surugaya', label: 'Studio X Shop', kind: 'direct', lookupCapabilities: ['title_search'],
    resultCapability: 'structured_offers', supportLevel: 'supported', physical: false,
    physicalStockMode: 'online_only', cloudflare: false, branchParserImplemented: false,
    confirmedPhysicalUsable: false, disabled: false,
    ...over,
  };
}
function status(over: Partial<StockStatusDto> = {}): StockStatusDto {
  return {
    provider: 'surugaya', status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1,
    blocked_kind: null, fresh_offers_found: 1, cached_offers_available: 0,
    ...over,
  };
}
function snapshot(over: Partial<StockSnapshotDto> = {}): StockSnapshotDto {
  return {
    offers: [offer()], statuses: [status()], providers: [provider()], sources: [],
    summary: { total: 1, available: 1, best_price: 1980, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    ...over,
  };
}
function json(body: unknown, st = 200) {
  return new Response(JSON.stringify(body), { status: st, headers: { 'content-type': 'application/json' } });
}
function routeFetch(snap: StockSnapshotDto, aliases: string[] = []) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.endsWith('/stock/aliases')) return json({ aliases });
    if (u.endsWith('/stock')) {
      if (method === 'POST') return json(snap);
      if (method === 'DELETE') return json({ snapshot: snap });
      return json(snap);
    }
    return json({});
  });
}

describe('StockPanel branches', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops the outer card chrome in bare mode', async () => {
    global.fetch = routeFetch(snapshot());
    const { container } = renderWithProviders(<StockPanel vnId="v90001" bare initialSnapshot={snapshot()} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    const section = container.querySelector('section')!;
    // Bare mode strips the rounded-xl/border/bg-bg-card chrome.
    expect(section.className).not.toContain('rounded-xl');
    expect(section.className).not.toContain('bg-bg-card');
  });

  it('suppresses the ErogePricePanel when showErogePrice is false even with extras', async () => {
    const extrasJson = JSON.stringify({
      schemaVersion: 1, selectedEpId: 90001, searchQuery: 'Title Y', refreshedAt: 1,
      candidates: [{
        epId: 90001, gameUrl: 'https://eroge-price.com/games/90001', fetchedAt: 1,
        detail: { id: 90001, title: 'Title Y', maker: null, genres: [], mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] }, releaseDate: null, coverImageUrl: null, description: null, officialSiteUrl: null, brandSiteUrl: null, platform: null, ageRating: null, hasDownload: false, hasPackage: true, fanzaDownloadCid: null, fanzaPackageCid: null, downloadRetailers: [], packageRetailers: [] },
        priceStats: { allTimeMin: null, allTimeMax: null, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: null, thirtyDayMinNote: null },
        priceHistory: [], related: { connections: [], sameBrand: [] },
      }],
    });
    const snap = snapshot({
      providers: [provider(), provider({ id: 'eroge_price', label: 'Eroge Price', kind: 'aggregate' })],
      statuses: [status(), status({ provider: 'eroge_price', extras_json: extrasJson })],
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" showErogePrice={false} initialSnapshot={snap} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    // Even though eroge_price extras exist, the panel is gated off.
    expect(screen.queryByTestId('eroge-panel')).toBeNull();
  });

  it('does not offer an alttitle suggestion that already exists as an alias', async () => {
    global.fetch = routeFetch(snapshot(), ['Alt Title Z']);
    renderWithProviders(
      <StockPanel vnId="v90001" title="Title Y" altTitle="Alt Title Z" initialSnapshot={snapshot()} />,
    );
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    // The alttitle already exists as an alias chip; it must not be re-offered as a suggestion.
    await screen.findAllByText('Alt Title Z');
    expect(screen.queryByRole('button', { name: /Alt Title Z/ })).toBeNull();
  });

  it('persists the search-setup disclosure open-state to localStorage', async () => {
    global.fetch = routeFetch(snapshot());
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    await waitFor(() => {
      const raw = localStorage.getItem('stock:ui:v1');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw as string).searchSetupOpen).toBe(true);
    });
  });
});
