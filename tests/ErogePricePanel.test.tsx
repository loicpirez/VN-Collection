// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ErogePricePanel } from '@/components/ErogePricePanel';
import type {
  EpApiGameDetail,
  EpApiRetailer,
  ErogePriceBundle,
  ErogePriceExtrasV1,
} from '@/lib/erogeprice-meta';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** SafeImage needs DisplaySettings; render a plain img. */
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

/** recharts needs layout measurement that jsdom lacks; stub the chart. */
vi.mock('@/components/charts/Sparkline', () => ({
  DEFAULT_PALETTE: ['#111', '#222', '#333', '#444'],
  PriceHistoryChart: ({ ariaLabel, formatYen }: { ariaLabel: string; formatYen: (value: number) => string }) => (
    <div data-testid="price-chart" aria-label={ariaLabel}>{formatYen(1234)}</div>
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];

function retailer(over: Partial<EpApiRetailer> = {}): EpApiRetailer {
  return {
    retailerId: 1,
    retailerName: 'Shop A',
    retailerLogoUrl: null,
    productUrl: 'https://example.test/p/1',
    productCode: null,
    isAvailable: true,
    condition: null,
    conditionNote: null,
    qualityRank: null,
    currentPrice: 2200,
    isOnSale: false,
    originalPrice: null,
    discountRate: null,
    regularPrice: null,
    lastChecked: null,
    ...over,
  };
}

function detail(over: Partial<EpApiGameDetail> = {}): EpApiGameDetail {
  return {
    id: 90001,
    title: 'Title Y',
    maker: 'Studio X',
    genres: ['adv', 'romance'],
    mainStaff: { scenario: ['Writer A'], illustration: ['Artist B'], voice: ['VA C'], music: [], singer: [] },
    releaseDate: '2020-04-24',
    coverImageUrl: 'https://example.test/cover.jpg',
    description: 'A synopsis for Title Y.',
    officialSiteUrl: 'https://example.test/official',
    brandSiteUrl: 'https://example.test/brand',
    platform: 'Windows',
    ageRating: '18+',
    hasDownload: true,
    hasPackage: true,
    fanzaDownloadCid: 'dlcid001',
    fanzaPackageCid: 'pkgcid001',
    downloadRetailers: Array.from({ length: 10 }, (_v, i) => retailer({ retailerId: 100 + i, retailerName: `DL Shop ${i}`, currentPrice: 1000 + i })),
    packageRetailers: [
      retailer({ retailerId: 200, retailerName: 'PKG Shop', currentPrice: 5000, isOnSale: true, originalPrice: 6000, discountRate: 17, condition: 'used', conditionNote: 'small scuff' }),
    ],
    ...over,
  };
}

function bundle(epId: number, over: Partial<ErogePriceBundle> = {}): ErogePriceBundle {
  return {
    epId,
    gameUrl: `https://eroge-price.com/games/${epId}`,
    fetchedAt: 1_700_000_000_000,
    detail: detail({ id: epId, title: `Title ${epId}` }),
    priceStats: { allTimeMin: 900, allTimeMax: 6000, allTimeMinNote: 'lowest ever', allTimeMaxNote: null, thirtyDayMin: 1200, thirtyDayMinNote: null },
    priceHistory: [
      // Recent timestamps so the default 2Y range window keeps both series.
      { id: 1, price: 1000, isOnSale: false, originalPrice: null, discountRate: null, scrapedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), retailerId: 100, retailerName: 'DL Shop 0', retailerEdition: 'DOWNLOAD', retailerLogoUrl: null, conditionNote: null },
      { id: 2, price: 5000, isOnSale: false, originalPrice: null, discountRate: null, scrapedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(), retailerId: 200, retailerName: 'PKG Shop', retailerEdition: 'PACKAGE', retailerLogoUrl: null, conditionNote: null },
    ],
    related: {
      connections: [{ id: 700, title: 'Related Conn', maker: 'Studio X', coverImageUrl: null, kind: 'sequel', kindLabel: 'Sequel' }],
      sameBrand: [{ id: 800, title: 'Same Brand Game', maker: 'Studio X', coverImageUrl: 'https://example.test/sb.jpg' }],
    },
    ...over,
  };
}

function extras(over: Partial<ErogePriceExtrasV1> = {}): ErogePriceExtrasV1 {
  return {
    schemaVersion: 1,
    candidates: [bundle(90001), bundle(90002)],
    selectedEpId: 90001,
    searchQuery: 'Title Y',
    refreshedAt: 1_700_000_000_000,
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * The candidate select-tab carries `aria-pressed`; the adjacent remove
 * button does not. Pick the select tab for a candidate by its title text.
 */
function selectTab(group: HTMLElement, titleText: string): HTMLElement {
  const btn = within(group)
    .getAllByRole('button')
    .find((b) => b.hasAttribute('aria-pressed') && (b.textContent ?? '').includes(titleText));
  if (!btn) throw new Error(`select tab not found for ${titleText}`);
  return btn;
}

describe('ErogePricePanel', () => {
  beforeEach(() => {
    // Default: resolve-titles returns an empty map; mutations succeed.
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      return json({ ok: true });
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null (renders nothing) when there are no candidates', () => {
    const { container } = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [] })} />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('renders the active candidate identity card, stats, chart, and retailer sections', async () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Title 90001' })).toBeTruthy();
    // Stats trio values formatted.
    expect(screen.getByText('lowest ever')).toBeTruthy();
    // Chart stub rendered.
    expect(screen.getByTestId('price-chart')).toBeTruthy();
    // Maker, platform, age rating chips.
    expect(screen.getAllByText('Studio X').length).toBeGreaterThan(0);
    expect(screen.getByText('Windows')).toBeTruthy();
    // Genres chips.
    expect(screen.getByText('adv')).toBeTruthy();
    // Resolve-titles fired for related items.
    await waitFor(() => {
      const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.startsWith('/api/stock/resolve-titles'))).toBe(true);
    });
  });

  it('switches the displayed candidate when a candidate tab is clicked', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    expect(screen.getByRole('heading', { level: 3, name: 'Title 90002' })).toBeTruthy();
  });

  it('PATCHes the primary candidate and toasts on success', async () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    // Switch to the non-primary candidate, then set it primary.
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    await waitFor(() => expect(screen.getByText(t.erogePrice.manualMatch.saved as string)).toBeTruthy());
    const patch = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(String(patch![0])).toBe('/api/vn/v90001/stock/eroge-price');
    expect(JSON.parse(patch![1].body)).toEqual({ ep_id: 90002 });
  });

  it('reverts the primary selection and shows an error when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'PATCH') return new Response('fail', { status: 500 });
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    await waitFor(() => expect(screen.getAllByText(t.erogePrice.manualMatch.error as string).length).toBeGreaterThan(0));
  });

  it('validates the add-candidate input and rejects a non-positive id', async () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await waitFor(() => expect(screen.getAllByText(t.erogePrice.manualMatch.invalidEpId as string).length).toBeGreaterThan(0));
    // No POST issued for an invalid id.
    const posts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('adds a candidate via POST then refetches the snapshot and rehydrates extras', async () => {
    const refreshed: ErogePriceExtrasV1 = extras({
      candidates: [bundle(90001), bundle(90002), bundle(90003)],
      selectedEpId: 90001,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'POST') return json({ ok: true });
      if (u === '/api/vn/v90001/stock' && (!init || init.method === undefined)) {
        return json({
          offers: [],
          statuses: [{ provider: 'eroge_price', status: 'ok', message: null, fetched_at: 1, offer_count: 0, blocked_kind: null, fresh_offers_found: 0, cached_offers_available: 0, extras_json: JSON.stringify(refreshed) }],
          providers: [],
          sources: [],
          summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null },
        });
      }
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await waitFor(() => expect(screen.getByText(t.erogePrice.manualMatch.addSuccess as string)).toBeTruthy());
    // The newly added candidate tab is now present.
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    expect(selectTab(group, 'Title 90003')).toBeTruthy();
  });

  it('removes a candidate via DELETE and drops its tab', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'DELETE') return json({ ok: true });
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(within(group).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` }));
    await waitFor(() => {
      const del = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(del).toBeTruthy();
      expect(String(del![0])).toContain('ep_id=90002');
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Title 90002/ })).toBeNull());
  });

  it('expands a long retailer list and collapses it again', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    // 10 DL retailers > RETAILER_PAGE_SIZE (8) so a "+2" expander is shown.
    const expander = screen.getByRole('button', { name: `${t.erogePrice.retailers} +2` });
    fireEvent.click(expander);
    // Once expanded, all rows visible and the toggle now closes.
    expect(screen.getByRole('button', { name: t.common.close as string })).toBeTruthy();
    // The retailer name renders both as a label and inside its external link.
    expect(screen.getAllByText('DL Shop 9').length).toBeGreaterThan(0);
  });

  it('changes the price-history range without crashing', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const rangeGroup = screen.getAllByRole('group', { name: t.erogePrice.priceHistory as string })[0];
    const allTime = within(rangeGroup).getByRole('button', { name: t.erogePrice.historyRange.allTime as string });
    fireEvent.click(allTime);
    expect(screen.getByTestId('price-chart')).toBeTruthy();
  });

  it('toggles a price series visibility chip', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    // Each (retailer x edition) yields a series chip; toggle the DL group button.
    const dlGroupBtn = screen.getByRole('button', { name: 'DL' });
    fireEvent.click(dlGroupBtn);
    // Still renders the chart afterwards.
    expect(screen.getByTestId('price-chart')).toBeTruthy();
  });

  it('renders related-game rails and links a matched title to its VN detail page', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) {
        return json({ 'Same Brand Game': { vnId: 'v90555', title: 'Same Brand Game' } });
      }
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    expect(screen.getByText('Related Conn')).toBeTruthy();
    expect(screen.getByText('Same Brand Game')).toBeTruthy();
    // After resolution the same-brand title links to the local VN page.
    await waitFor(() => {
      const vnLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/vn/v90555');
      expect(vnLinks.length).toBeGreaterThan(0);
    });
  });
});
