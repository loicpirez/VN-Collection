// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPricesSection } from '@/components/StockPricesSection';
import type { StockSnapshotForPrices } from '@/lib/stock-prices';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Stub the heavy lazy ErogePricePanel - it has its own dedicated test file. */
vi.mock('@/components/ErogePricePanel', () => ({
  ErogePricePanel: ({ vnId }: { vnId: string }) => <div data-testid="eroge-panel">panel:{vnId}</div>,
}));

/** A persisted extras_json blob the snapshot decoder will accept as eroge_price. */
function extrasJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    selectedEpId: 90001,
    searchQuery: 'Title Y',
    refreshedAt: 1_700_000_000_000,
    candidates: [
      {
        epId: 90001,
        gameUrl: 'https://eroge-price.com/games/90001',
        fetchedAt: 1_700_000_000_000,
        detail: {
          id: 90001,
          title: 'Title Y',
          maker: 'Studio X',
          genres: [],
          mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] },
          releaseDate: null,
          coverImageUrl: null,
          description: null,
          officialSiteUrl: null,
          brandSiteUrl: null,
          platform: null,
          ageRating: null,
          hasDownload: false,
          hasPackage: true,
          fanzaDownloadCid: null,
          fanzaPackageCid: null,
          downloadRetailers: [],
          packageRetailers: [],
        },
        priceStats: { allTimeMin: null, allTimeMax: null, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: null, thirtyDayMinNote: null },
        priceHistory: [],
        related: { connections: [], sameBrand: [] },
      },
    ],
  });
}

function snapshotWithExtras(): StockSnapshotForPrices {
  return { statuses: [{ provider: 'eroge_price', extras_json: extrasJson() }] };
}

describe('StockPricesSection', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the panel immediately from initialSnapshot without fetching', async () => {
    renderWithProviders(<StockPricesSection vnId="v90001" initialSnapshot={snapshotWithExtras()} />);
    await waitFor(() => expect(screen.getByTestId('eroge-panel')).toBeTruthy());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing when initialSnapshot has no eroge_price extras', () => {
    const { container } = renderWithProviders(
      <StockPricesSection vnId="v90001" initialSnapshot={{ statuses: [] }} />,
    );
    // No skeleton (snapshot provided), no panel (no extras) -> empty render.
    expect(container.querySelector('[data-testid="eroge-panel"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('shows the price skeleton while fetching, then renders the panel on success', async () => {
    let resolveFetch!: (r: Response) => void;
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<Response>((res) => {
        resolveFetch = res;
      }),
    );
    const { container } = renderWithProviders(<StockPricesSection vnId="v90007" />);
    // Skeleton placeholder is on screen while the request is pending.
    expect(container.querySelector('.animate-pulse, [aria-hidden]')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith('/api/vn/v90007/stock', expect.objectContaining({ cache: 'no-store' }));
    resolveFetch(
      new Response(JSON.stringify(snapshotWithExtras()), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await waitFor(() => expect(screen.getByTestId('eroge-panel')).toBeTruthy());
  });

  it('renders an error alert when the fetch responds non-ok', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('nope', { status: 500 }),
    );
    renderWithProviders(<StockPricesSection vnId="v90008" />);
    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeTruthy());
    expect(screen.queryByTestId('eroge-panel')).toBeNull();
  });

  it('renders nothing when the fetched snapshot has no usable extras', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ statuses: [{ provider: 'suruga', extras_json: null }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { container } = renderWithProviders(<StockPricesSection vnId="v90009" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(screen.queryByTestId('eroge-panel')).toBeNull();
  });
});
