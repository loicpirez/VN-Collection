// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within, fireEvent, waitFor } from '@testing-library/react';
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
  PriceHistoryChart: ({ ariaLabel, formatYen }: { ariaLabel: string; formatYen: (value: number) => string }) => (
    <div data-testid="price-chart" aria-label={ariaLabel}>{formatYen(1234)}</div>
  ),
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

  it('renders missing currency and date fallbacks with Japanese staff separators', () => {
    const missing = bundle(90001, {
      detail: detail({
        id: 90001,
        title: 'Missing Fields',
        releaseDate: '2020-04-24',
        mainStaff: { scenario: ['Writer A', 'Writer B'], illustration: [], voice: [], music: [], singer: [] },
      }),
      priceStats: { allTimeMin: null, allTimeMax: null, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: null, thirtyDayMinNote: null },
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [missing], selectedEpId: 90001 })} />, { locale: 'ja' });
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/2020/)).toBeTruthy();
    expect(screen.getByText('Writer A、Writer B')).toBeTruthy();
  });

  it('formats French release dates and invalid date strings safely', () => {
    renderWithProviders(
      <ErogePricePanel
        vnId="v90001"
        extras={extras({
          candidates: [
            bundle(90001, { detail: detail({ id: 90001, title: 'French Date', releaseDate: '2020-04-24' }) }),
            bundle(90002, { detail: detail({ id: 90002, title: 'Bad Date', releaseDate: 'not-a-date' }) }),
          ],
          selectedEpId: 90001,
        })}
      />,
      { locale: 'fr' },
    );
    expect(screen.getAllByText(/2020/).length).toBeGreaterThan(0);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Bad Date'));
    expect(screen.getByText('not-a-date')).toBeTruthy();
  });

  it('formats English release dates with the en-US locale', () => {
    renderWithProviders(
      <ErogePricePanel
        vnId="v90001"
        extras={extras({
          candidates: [
            bundle(90001, { detail: detail({ id: 90001, title: 'English Date', releaseDate: '2020-04-24' }) }),
          ],
          selectedEpId: 90001,
        })}
      />,
      { locale: 'en' },
    );
    expect(screen.getByText('Apr 24, 2020')).toBeTruthy();
  });

  it('groups repeated price-history points into one series and can unhide a hidden group', () => {
    const withRepeatedHistory = bundle(90001, {
      priceHistory: [
        { id: 1, price: 1000, isOnSale: false, originalPrice: null, discountRate: null, scrapedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(), retailerId: 100, retailerName: 'DL Shop', retailerEdition: 'DOWNLOAD', retailerLogoUrl: null, conditionNote: null },
        { id: 2, price: 1200, isOnSale: false, originalPrice: null, discountRate: null, scrapedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(), retailerId: 100, retailerName: 'DL Shop', retailerEdition: 'DOWNLOAD', retailerLogoUrl: null, conditionNote: null },
      ],
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ candidates: [withRepeatedHistory, bundle(90002)], selectedEpId: 90001 })} />);
    const dlGroupBtn = screen.getByRole('button', { name: 'DL' });
    fireEvent.click(dlGroupBtn);
    fireEvent.click(dlGroupBtn);
    const chip = screen.getByRole('button', { name: /DL Shop \(DL\)/ });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.getByTestId('price-chart')).toBeTruthy();
  });

  it('omits stat guide lines when no all-time min or max exists', () => {
    renderWithProviders(
      <ErogePricePanel
        vnId="v90001"
        extras={extras({
          candidates: [
            bundle(90001, {
              priceStats: { allTimeMin: null, allTimeMax: null, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: null, thirtyDayMinNote: null },
            }),
          ],
          selectedEpId: 90001,
        })}
      />,
    );
    expect(screen.getByTestId('price-chart')).toBeTruthy();
  });

  it('handles failed and malformed related-title resolution responses silently', async () => {
    const withRelated = extras({
      candidates: [
        bundle(90001, {
          related: {
            connections: [{ id: 700, title: 'Related Conn', maker: 'Studio X', coverImageUrl: null, kind: 'sequel', kindLabel: 'Sequel' }],
            sameBrand: [{ id: 800, title: 'Same Brand Game', maker: 'Studio X', coverImageUrl: null }],
          },
        }),
      ],
      selectedEpId: 90001,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({ error: 'resolve failed' }, 500);
      return json({ ok: true });
    });
    const first = renderWithProviders(<ErogePricePanel vnId="v90001" extras={withRelated} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByText('Same Brand Game')).toBeTruthy();
    first.unmount();

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({ bad: true });
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90002" extras={withRelated} />);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
  });

  it('keeps unmatched related-title entries external when the resolver returns null', async () => {
    const withRelated = extras({
      candidates: [
        bundle(90001, {
          related: {
            connections: [],
            sameBrand: [{ id: 800, title: 'Same Brand Game', maker: 'Studio X', coverImageUrl: null }],
          },
        }),
      ],
      selectedEpId: 90001,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return json({ 'Same Brand Game': null });
      return json({ ok: true });
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={withRelated} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const localLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/vn/v90555');
    expect(localLinks).toHaveLength(0);
  });

  it('falls back to the first candidate when the selected id is missing and initializes to zero for an empty list', () => {
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras({ selectedEpId: 123456 })} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Title 90001' })).toBeTruthy();
    const { container } = renderWithProviders(<ErogePricePanel vnId="v90002" extras={extras({ candidates: [], selectedEpId: null })} />);
    expect(container.querySelector('section')).toBeNull();
  });

  it('ignores duplicate set-primary clicks while the PATCH is in flight', async () => {
    let resolvePatch: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'PATCH') return new Promise<Response>((resolve) => { resolvePatch = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    const setPrimary = screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) });
    act(() => {
      fireEvent.click(setPrimary);
      fireEvent.click(setPrimary);
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'PATCH')).toHaveLength(1);
    resolvePatch?.(json({ ok: true }));
    await waitFor(() => expect(screen.getByText(t.erogePrice.manualMatch.saved as string)).toBeTruthy());
  });

  it('ignores stale set-primary success after unmount and aborted set-primary failures', async () => {
    let resolvePatch: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'PATCH') return new Promise<Response>((resolve) => { resolvePatch = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    const { unmount } = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    unmount();
    resolvePatch?.(json({ ok: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'PATCH') return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90002" extras={extras()} />);
    const group2 = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group2, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores stale set-primary success after the panel identity changes', async () => {
    let resolvePatch: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'PATCH') return new Promise<Response>((resolve) => { resolvePatch = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    const view = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    view.rerender(<ErogePricePanel vnId="v90002" extras={extras()} />);
    resolvePatch?.(json({ ok: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Title 90001' })).toBeTruthy();
  });

  it('uses the default set-primary error copy when the thrown message is empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'PATCH') return Promise.reject(new Error(''));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(selectTab(group, 'Title 90002'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.setPrimary as string) }));
    await waitFor(() => expect(screen.getAllByText(t.erogePrice.manualMatch.error as string).length).toBeGreaterThan(0));
  });

  it('uses the default add error copy when the thrown message is empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'POST') return Promise.reject(new Error(''));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await waitFor(() => expect(screen.getAllByText(t.erogePrice.manualMatch.addError as string).length).toBeGreaterThan(0));
  });

  it('ignores duplicate add clicks while the POST is in flight', async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'POST') return new Promise<Response>((resolve) => { resolvePost = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    const confirm = screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1);
    resolvePost?.(json({ ok: true }));
  });

  it('handles add snapshot failures and malformed extras', async () => {
    async function runCase(snapshotBody: unknown, expectedMessage: string, status = 200) {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.startsWith('/api/stock/resolve-titles')) return json({});
        if (init?.method === 'POST') return json({ ok: true });
        if (u === '/api/vn/v90001/stock') return json(snapshotBody, status);
        return json({ ok: true });
      });
      const view = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
      fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
      await waitFor(() => expect(screen.getAllByText(expectedMessage).length).toBeGreaterThan(0));
      view.unmount();
    }
    await runCase({ error: 'snapshot down' }, 'snapshot down', 500);
    await runCase({ bad: true }, t.erogePrice.manualMatch.addError as string);
    await runCase({ offers: [], statuses: [], providers: [], sources: [], summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null } }, t.erogePrice.manualMatch.addError as string);
  });

  it('ignores stale add success after the panel unmounts and aborted add failures', async () => {
    let resolvePost: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'POST') return new Promise<Response>((resolve) => { resolvePost = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    const { unmount } = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    unmount();
    resolvePost?.(json({ ok: true }));
    await act(async () => {
      await Promise.resolve();
    });

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'POST') return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90002" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores stale add snapshot success after unmount', async () => {
    let resolveSnapshot: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'POST') return Promise.resolve(json({ ok: true }));
      if (u === '/api/vn/v90001/stock') return new Promise<Response>((resolve) => { resolveSnapshot = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    const refreshed = extras({ candidates: [bundle(90001), bundle(90002), bundle(90003)] });
    const { unmount } = renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.erogePrice.manualMatch.addCandidate as string) }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '90003' } });
    fireEvent.click(screen.getByRole('button', { name: t.erogePrice.manualMatch.confirmAdd as string }));
    await waitFor(() => expect(resolveSnapshot).toBeDefined());
    unmount();
    resolveSnapshot?.(json({
      offers: [],
      statuses: [{ provider: 'eroge_price', status: 'ok', message: null, fetched_at: 1, offer_count: 0, blocked_kind: null, fresh_offers_found: 0, cached_offers_available: 0, extras_json: JSON.stringify(refreshed) }],
      providers: [],
      sources: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null },
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('ignores duplicate remove clicks and aborted remove failures', async () => {
    let resolveDelete: ((response: Response) => void) | undefined;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'DELETE') return new Promise<Response>((resolve) => { resolveDelete = resolve; });
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    const remove = within(group).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` });
    act(() => {
      fireEvent.click(remove);
      fireEvent.click(remove);
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'DELETE')).toHaveLength(1);
    resolveDelete?.(json({ ok: true }));

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'DELETE') return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90002" extras={extras()} />);
    const group2 = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(within(group2).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the default remove error copy when the thrown message is empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/stock/resolve-titles')) return Promise.resolve(json({}));
      if (init?.method === 'DELETE') return Promise.reject(new Error(''));
      return Promise.resolve(json({ ok: true }));
    });
    renderWithProviders(<ErogePricePanel vnId="v90001" extras={extras()} />);
    const group = screen.getByRole('group', { name: t.erogePrice.candidates as string });
    fireEvent.click(within(group).getByRole('button', { name: `${t.erogePrice.manualMatch.removeCandidate}: Title 90002` }));
    await waitFor(() => expect(screen.getAllByText(t.erogePrice.manualMatch.removeError as string).length).toBeGreaterThan(0));
  });
});
