// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ErogePricePanel } from '@/components/ErogePricePanel';
import type { EpApiGameDetail, EpApiRetailer, ErogePriceBundle, ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));
vi.mock('@/components/charts/Sparkline', () => ({
  DEFAULT_PALETTE: ['#111', '#222', '#333', '#444'],
  PriceHistoryChart: ({ ariaLabel }: { ariaLabel: string }) => <div data-testid="price-chart" aria-label={ariaLabel} />,
}));

const t = dictionaries[DEFAULT_LOCALE];

function retailer(over: Partial<EpApiRetailer> = {}): EpApiRetailer {
  return {
    retailerId: 1, retailerName: 'Shop A', retailerLogoUrl: null, productUrl: 'https://example.test/p/1',
    productCode: null, isAvailable: true, condition: null, conditionNote: null, qualityRank: null,
    currentPrice: 2200, isOnSale: false, originalPrice: null, discountRate: null, regularPrice: null, lastChecked: null,
    ...over,
  };
}

function detail(over: Partial<EpApiGameDetail> = {}): EpApiGameDetail {
  return {
    id: 90001, title: 'Title Y', maker: 'Studio X', genres: [],
    mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] },
    releaseDate: '2020-04-24', coverImageUrl: null, description: null, officialSiteUrl: null,
    brandSiteUrl: null, platform: null, ageRating: null, hasDownload: false, hasPackage: true,
    fanzaDownloadCid: null, fanzaPackageCid: null, downloadRetailers: [], packageRetailers: [],
    ...over,
  };
}

function bundle(epId: number, over: Partial<ErogePriceBundle> = {}): ErogePriceBundle {
  return {
    epId, gameUrl: `https://eroge-price.com/games/${epId}`, fetchedAt: 1_700_000_000_000,
    detail: detail({ id: epId, title: `Title ${epId}` }),
    priceStats: { allTimeMin: 900, allTimeMax: 6000, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: 1200, thirtyDayMinNote: null },
    priceHistory: [],
    related: { connections: [], sameBrand: [] },
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

function selectTab(group: HTMLElement, titleText: string): HTMLElement {
  const btn = within(group)
    .getAllByRole('button')
    .find((b) => b.hasAttribute('aria-pressed') && (b.textContent ?? '').includes(titleText));
  if (!btn) throw new Error(`select tab not found for ${titleText}`);
  return btn;
}

describe('ErogePricePanel branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      return json({ ok: true });
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toasts and shows the inline add error when the POST fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'POST') return json({ error: 'add boom' }, 500);
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await waitFor(() => expect(screen.getAllByText('add boom').length).toBeGreaterThan(0));
  });

  it('reverts the candidate list and toasts when removal DELETE fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'DELETE') return json({ error: 'remove boom' }, 500);
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(within(group).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` }));
    await waitFor(() => expect(screen.getAllByText('remove boom').length).toBeGreaterThan(0));
    // Optimistic removal was reverted -> the tab is back.
    await waitFor(() => expect(selectTab(group, 'Title 90002')).toBeTruthy());
  });

  it('removing the active candidate switches the active tab to the survivor', async () => {
    let deleteHit = false;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'DELETE') { deleteHit = true; return json({ ok: true }); }
      return json({ ok: true });
    });
    // Make 90002 the active (and selected primary) candidate.
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ selectedEpId: 90002 })} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    // Remove the active candidate 90002.
    fireEvent.click(within(group).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` }));
    await waitFor(() => expect(deleteHit).toBe(true));
    // With one candidate left the tab strip disappears; the survivor card renders.
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Title 90001' })).toBeTruthy());
  });

  it('does not remove the only remaining candidate', async () => {
    const delSpy = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({});
      if (init?.method === 'DELETE') { delSpy(); return json({ ok: true }); }
      return json({ ok: true });
    });
    // Single candidate -> no remove button rendered (tab strip hidden), and the
    // guard `candidates.length <= 1` blocks removal anyway.
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [bundle(90001)], selectedEpId: 90001 })} />);
    expect(screen.queryByRole('group', { name: t.erogePrice.candidates as string })).toBeNull();
    expect(delSpy).not.toHaveBeenCalled();
  });

  it('renders the candidate year fallback to the ep id when releaseDate is null', () => {
    const noDate = bundle(90002, { detail: detail({ id: 90002, title: 'Title 90002', releaseDate: null }) });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [bundle(90001), noDate] })} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    // The 90002 tab shows the ep id (90002) because there is no release year.
    expect(within(group).getByText('90002')).toBeTruthy();
  });

  it('toggles the add panel open then closed', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const addBtn = screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) });
    fireEvent.click(addBtn);
    expect(screen.getByRole('spinbutton')).toBeTruthy();
    fireEvent.click(addBtn);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('toggles a single price-series chip', () => {
    const withHistory = bundle(90001, {
      priceHistory: [
        { id: 1, price: 1000, isOnSale: false, originalPrice: null, discountRate: null, scrapedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), retailerId: 100, retailerName: 'DL Shop', retailerEdition: 'DOWNLOAD', retailerLogoUrl: null, conditionNote: null },
      ],
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [withHistory, bundle(90002)], selectedEpId: 90001 })} />);
    // The per-series chip is labelled "DL Shop (DL)".
    const chip = screen.getByRole('button', { name: /DL Shop \(DL\)/ });
    fireEvent.click(chip);
    expect(screen.getByTestId('price-chart')).toBeTruthy();
  });

  it('renders a related-connection rail with a kind label and a missing cover', () => {
    const withRelated = bundle(90001, {
      related: {
        connections: [{ id: 700, title: 'No Cover Conn', maker: null, coverImageUrl: null, kind: 'sequel', kindLabel: 'Sequel' }],
        sameBrand: [],
      },
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [withRelated, bundle(90002)], selectedEpId: 90001 })} />);
    expect(screen.getByText('No Cover Conn')).toBeTruthy();
    expect(screen.getByText('Sequel')).toBeTruthy();
  });
});
