// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPanel } from '@/components/StockPanel';
import type { StockOfferDto, StockProviderDto, StockSnapshotDto, StockStatusDto } from '@/lib/stock-api-types';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { ONLINE_STOCK_SENTINEL } from '@/lib/stock-provider-constants';

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
function source(over: Partial<StockSnapshotDto['sources'][number]> = {}): StockSnapshotDto['sources'][number] {
  return {
    id: 7,
    vn_id: 'v90001',
    release_id: null,
    provider: 'surugaya',
    url: 'https://example.test/source/7',
    product_id: 'source-7',
    created_at: Date.now(),
    updated_at: Date.now(),
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
    const { container } = renderWithProviders(<StockPanel vnId="v90001" bare title="Bare stock title" initialSnapshot={snapshot()} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    const section = container.querySelector('section')!;
    // Bare mode strips the rounded-xl/border/bg-bg-card chrome.
    expect(section.className).not.toContain('rounded-xl');
    expect(section.className).not.toContain('bg-bg-card');
    expect(screen.getByText('Bare stock title').className).not.toContain('mt-1');
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

  it('renders cached AliceNet offers with legacy labels, warnings, stale state, and rejected reasons', async () => {
    const oldFetch = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const snap = snapshot({
      offers: [
        offer({
          provider_offer_id: 'off-alicenet',
          source: 'alicenet',
          title: 'AliceNet cached copy',
          availability: 'limited',
          availability_label: 'marketplace:2034',
          condition: 'Used (Rank B)',
          edition_label: 'Limited edition',
          list_price: 3000,
          marketplace_price: 2034,
          marketplace_count: 3,
          match_confidence: 'high',
          match_warnings_json: JSON.stringify(['bonus-only item', 'untranslated-warning']),
          fetched_at: oldFetch,
        }),
        offer({
          provider_offer_id: 'off-sold',
          title: 'Sold out copy',
          availability: 'out_of_stock',
          price: null,
        }),
        offer({
          provider_offer_id: 'off-unrelated',
          title: 'Unrelated goods copy',
          content_kind: 'game_package',
          series_relation: 'unrelated',
          match_confidence: 'high',
        }),
      ],
      summary: {
        total: 3,
        available: 1,
        best_price: 1980,
        related_available: 0,
        needs_review: 0,
        rejected: 1,
        last_refresh: Date.now(),
      },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);

    await waitFor(() => expect(screen.getByText('AliceNet cached copy')).toBeTruthy());
    const cachedSource = (t.stock.source as string).replace('{source}', t.stock.sourceLabels.cached);
    expect(screen.getByText((content) => content.includes(cachedSource))).toBeTruthy();
    expect(screen.getAllByText((content) => /2[\s,. ]?034/.test(content)).length).toBeGreaterThan(0);
    expect(screen.getByText(t.stock.conditionLabels.used_rank_b as string)).toBeTruthy();
    expect(screen.getByText(t.stock.editionLabels.limited_edition as string)).toBeTruthy();
    expect(screen.getByText(t.stock.matchWarnings.bonus_only_item as string)).toBeTruthy();
    expect(screen.getByText('untranslated-warning')).toBeTruthy();
    expect(screen.getByText(t.stock.staleHint as string)).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.outOfStock as string)).toBeTruthy();
    expect(screen.getByText('Unrelated goods copy')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.unrelatedTitle as string)).toBeTruthy();
  });

  it('logs non-abort alias preload failures without blocking the stock panel', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) throw new Error('alias preload failed');
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[StockPanel] alias fetch failed:', expect.any(Error)));
    expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0);
  });

  it('ignores AbortError from alias preload without logging an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) throw abortError;
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    await flushMicrotasks();
    expect(errorSpy).not.toHaveBeenCalledWith('[StockPanel] alias fetch failed:', expect.anything());
  });

  it('ignores AbortError during the initial stock load', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) throw abortError;
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" />);
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats a non-OK alias preload as an empty alias list without logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ error: 'alias route down' }, 503);
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    expect(errorSpy).not.toHaveBeenCalledWith('[StockPanel] alias fetch failed:', expect.anything());
  });

  it('falls back to an empty alias list when the alias preload payload is malformed', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ broken: true });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    await waitFor(() => expect(screen.queryByRole('button', { name: t.stock.aliasRemoveTerm as string })).toBeNull());
  });

  it('uses dense panel spacing when requested', async () => {
    global.fetch = routeFetch(snapshot());
    const { container } = renderWithProviders(<StockPanel vnId="v90001" dense initialSnapshot={snapshot()} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    expect(container.querySelector('section')?.className).toContain('p-4');
  });

  it('defaults to physical providers after a live stock load', async () => {
    const snap = snapshot({
      providers: [
        provider({ id: 'physical_shop', label: 'Physical Shop', physical: true, physicalStockMode: 'exact_online', confirmedPhysicalUsable: true }),
        provider({ id: 'online_shop', label: 'Online Shop' }),
      ],
      statuses: [status({ provider: 'physical_shop' }), status({ provider: 'online_shop' })],
    });
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snap);
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" />);
    await waitFor(() => expect(screen.getByRole('button', { name: t.stock.checkPhysical as string })).toBeTruthy());
  });

  it('ignores non-OK providers during a bulk refresh and still completes the run', async () => {
    const failingPost = vi.fn(() => json({ error: 'provider unavailable' }, 503));
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'POST') return failingPost();
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(failingPost).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: t.stock.stop as string })).toBeNull());
  });

  it('handles AbortError during a bulk refresh without surfacing an error', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'POST') throw abortError;
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(screen.queryByRole('button', { name: t.stock.stop as string })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('continues a bulk refresh across malformed and throwing provider responses', async () => {
    const snap = snapshot({
      providers: [
        provider({ id: 'surugaya', label: 'Studio X Shop' }),
        provider({ id: 'second_shop', label: 'Second Shop' }),
      ],
      statuses: [status({ provider: 'surugaya' }), status({ provider: 'second_shop' })],
    });
    let postCalls = 0;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'POST') {
        postCalls += 1;
        if (postCalls === 1) return json({ broken: true });
        throw new Error('second provider failed');
      }
      if (u.endsWith('/stock')) return json(snap);
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(postCalls).toBe(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: t.stock.stop as string })).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a malformed single-provider refresh response', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'POST') return json({ broken: true });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(t.common.error as string));
  });

  it('uses the generic single-provider refresh error when the route throws a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') return Promise.reject('plain refresh failure');
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(t.common.error as string));
  });

  it('drops stale single-provider refresh success and failure after VN identity changes', async () => {
    let successResolve: (response: Response) => void = () => {};
    let successCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') {
        successCalls += 1;
        return new Promise<Response>((resolve) => { successResolve = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const successView = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(successCalls).toBe(1));
    successView.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second refresh row' })] })} />);
    await act(async () => {
      successResolve(json(snapshot({ offers: [offer({ title: 'Stale refresh row' })] })));
      await flushMicrotasks();
    });
    expect(screen.queryByText('Stale refresh row')).toBeNull();
    successView.unmount();

    let failureReject: (error: Error) => void = () => {};
    let failureCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') {
        failureCalls += 1;
        return new Promise<Response>((_resolve, reject) => { failureReject = reject; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const failureView = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(failureCalls).toBe(1));
    failureView.rerender(<StockPanel vnId="v90003" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90003', title: 'Third refresh row' })] })} />);
    await act(async () => {
      failureReject(new Error('late provider failure'));
      await flushMicrotasks();
    });
    expect(screen.queryByText('late provider failure')).toBeNull();
  });

  it('drops stale bulk refresh work after a provider response resolves under a new VN id', async () => {
    let resolvePost: (response: Response) => void = () => {};
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>((resolve) => { resolvePost = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(postCalls).toBe(1));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second bulk row' })] })} />);
    await act(async () => {
      resolvePost(json({ error: 'late bulk response' }, 503));
      await flushMicrotasks();
    });
    expect(screen.queryByText('late bulk response')).toBeNull();
  });

  it('ignores duplicate single-provider refresh clicks while one is in flight', async () => {
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>(() => undefined);
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    const button = screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') });
    act(() => {
      button.click();
      button.click();
    });
    expect(postCalls).toBe(1);
  });

  it('surfaces alias add network errors', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') throw new Error('alias network failed');
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Network Alias' } });
    const aliasForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('alias network failed'))).toBe(true));
  });

  it('surfaces alias add HTTP errors and keeps server-returned aliases', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return json({ aliases: ['Server Alias'], error: 'alias route failed' }, 409);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Server Alias' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('alias route failed'))).toBe(true));
    expect(screen.getAllByText('Server Alias').length).toBeGreaterThan(0);
  });

  it('falls back to the generic alias add error for malformed HTTP responses', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return json({ broken: true }, 409);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Malformed Alias' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('uses the generic alias add error when the route throws a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return Promise.reject('plain alias add failure');
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Plain Alias Error' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('drops rejected alias add work after the VN id changes', async () => {
    let rejectAlias: (error: Error) => void = () => {};
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>((_resolve, reject) => { rejectAlias = reject; });
      }
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Rejected Alias' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(postCalls).toBe(1));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second rejected alias row' })] })} />);
    await act(async () => {
      rejectAlias(new Error('late alias failure'));
      await flushMicrotasks();
    });
    expect(screen.queryByText('late alias failure')).toBeNull();
  });

  it('surfaces alias remove network errors', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') throw new Error('alias remove failed');
      if (u.endsWith('/stock/aliases')) return json({ aliases: ['Existing Alias'] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('alias remove failed'))).toBe(true));
  });

  it('cancels alias removal before the delete request starts', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: ['Existing Alias'] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.cancel as string }));
    await flushMicrotasks();
    const aliasDeletes = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/stock/aliases') && call[1]?.method === 'POST');
    expect(aliasDeletes).toHaveLength(0);
  });

  it('ignores duplicate alias removals while the confirmation is open', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: ['Existing Alias'] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const removeBtn = await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string });
    act(() => {
      removeBtn.click();
      removeBtn.click();
    });
    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1);
  });

  it('surfaces alias remove HTTP errors', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return json({ error: 'alias delete route failed' }, 409);
      if (u.endsWith('/stock/aliases')) return json({ aliases: ['Existing Alias'] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('alias delete route failed'))).toBe(true));
  });

  it('uses the generic alias remove error when the route throws a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return Promise.reject('plain alias remove failure');
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: ['Existing Alias'] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('ignores AbortError during alias removal', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') throw abortError;
      if (u.endsWith('/stock/aliases')) return json({ aliases: ['Existing Alias'] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces clear-cache network errors', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'DELETE') throw new Error('clear network failed');
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('clear network failed'))).toBe(true));
  });

  it('uses the generic clear-cache error when the route throws a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'DELETE') return Promise.reject('plain clear failure');
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('keeps form submit buttons inert for blank values and while loading', async () => {
    let resolveAlias!: (value: Response) => void;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveAlias = resolve;
        });
      }
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    const aliasForm = input.closest('form') as HTMLFormElement;
    const submit = within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Slow Alias' } });
    fireEvent.click(submit);
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    fireEvent.submit(aliasForm);
    await act(async () => {
      resolveAlias(json({ aliases: ['Slow Alias'] }));
    });
    await waitFor(() => expect(screen.getByText(t.stock.aliasAddedToast as string)).toBeTruthy());
  });

  it('ignores duplicate alias submissions while the alias mutation is already in flight', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') return new Promise<Response>(() => undefined);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Duplicate Alias' } });
    const aliasForm = input.closest('form') as HTMLFormElement;
    const submit = within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string });
    act(() => {
      submit.click();
      submit.click();
    });
    const aliasPosts = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/stock/aliases') && call[1]?.method === 'POST');
    expect(aliasPosts).toHaveLength(1);
  });

  it('drops a completed alias mutation after the VN id changes', async () => {
    let resolveAlias: (response: Response) => void = () => {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveAlias = resolve; });
      }
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Stale Alias' } });
    const aliasForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string }));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second stock row' })] })} />);
    resolveAlias(json({ aliases: ['Stale Alias'] }));
    await flushMicrotasks();
    expect(screen.queryByText(t.stock.aliasAddedToast as string)).toBeNull();
  });

  it('drops a completed alias removal after the VN id changes', async () => {
    let resolveAlias: (response: Response) => void = () => {};
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>((resolve) => { resolveAlias = resolve; });
      }
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: ['Existing Alias'] }));
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(postCalls).toBe(1));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second alias row' })] })} />);
    resolveAlias(json({ aliases: [] }));
    await flushMicrotasks();
    expect(screen.queryByText(t.stock.aliasRemovedToast as string)).toBeNull();
  });

  it('ignores duplicate stock refresh clicks while a refresh is already in flight', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'POST') return new Promise<Response>(() => undefined);
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    const checkButton = screen.getByRole('button', { name: new RegExp(t.stock.check as string) });
    act(() => {
      checkButton.click();
      checkButton.click();
    });
    const refreshPosts = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/stock') && call[1]?.method === 'POST');
    expect(refreshPosts).toHaveLength(1);
  });

  it('drops clear-cache completion after the VN id changes', async () => {
    let resolveClear: (response: Response) => void = () => {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'DELETE') {
        return new Promise<Response>((resolve) => { resolveClear = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot({ offers: [offer({ title: 'Before clear stale' })] })} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second clear row' })] })} />);
    resolveClear(json({ snapshot: snapshot({ offers: [] }) }));
    await flushMicrotasks();
    expect(screen.queryByText(t.stock.cacheClearedToast as string)).toBeNull();
  });

  it('ignores duplicate clear-cache confirmations while the clear request is in flight', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'DELETE') return new Promise<Response>(() => undefined);
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    const clearButton = within(dialog).getByRole('button', { name: t.stock.clearCache as string });
    act(() => {
      clearButton.click();
      clearButton.click();
    });
    const deleteCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/stock') && call[1]?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
  });

  it('ignores a stale stock load after the VN id changes', async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u === '/api/vn/v90001/stock') return first;
      if (u === '/api/vn/v90002/stock') return Promise.resolve(json(snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second VN offer' })] })));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" />);
    view.rerender(<StockPanel vnId="v90002" />);
    await waitFor(() => expect(screen.getByText('Second VN offer')).toBeTruthy());
    await act(async () => {
      resolveFirst(json(snapshot({ offers: [offer({ title: 'Stale first VN offer' })] })));
    });
    expect(screen.queryByText('Stale first VN offer')).toBeNull();
  });

  it('uses the generic load error when stock loading rejects with a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock')) return Promise.reject('plain failure');
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(t.common.error as string));
  });

  it('falls back to closed stock UI preferences when localStorage reads fail', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('local storage unavailable');
    });
    global.fetch = routeFetch(snapshot());
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    const searchSetup = screen.getByText(t.stock.searchSetup as string).closest('details') as HTMLDetailsElement;
    expect(searchSetup.open).toBe(false);
  });

  it('surfaces clear-cache HTTP errors returned by the stock route', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'DELETE') return json({ error: 'clear route failed' }, 500);
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('clear route failed'))).toBe(true));
  });

  it('ignores AbortError during clear-cache', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock') && init?.method === 'DELETE') throw abortError;
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the manual source submit inert for blank values and invalid provider-preview URLs', async () => {
    global.fetch = routeFetch(snapshot(), []);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    const sourceForm = input.closest('form') as HTMLFormElement;
    const submit = within(sourceForm).getByRole('button', { name: t.stock.manualSourceAdd as string });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'not a url' } });
    expect(screen.queryByText((t.stock.manualSourceDetected as string).replace('{provider}', 'Studio X Shop'))).toBeNull();
  });

  it('adds a manual source and clears the source input after success', async () => {
    const snap = snapshot({
      sources: [source()],
    });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock/sources') && init?.method === 'POST') return json(snap);
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/7' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getByText(t.stock.manualSourceAddedToast as string)).toBeTruthy());
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('surfaces manual source add HTTP errors', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock/sources') && init?.method === 'POST') return json({ error: 'manual source rejected' }, 422);
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/bad' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('manual source rejected'))).toBe(true));
  });

  it('uses the generic manual source add error when the route throws a non-Error value', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'POST') return Promise.reject('plain source add failure');
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/plain-add' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('ignores AbortError during manual source add', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock/sources') && init?.method === 'POST') throw abortError;
      if (u.endsWith('/stock')) return json(snapshot());
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/abort' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops manual source add completion after the VN id changes', async () => {
    let resolveSource: (response: Response) => void = () => {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveSource = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/stale' } });
    fireEvent.click(within(input.closest('form') as HTMLFormElement).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second source row' })] })} />);
    resolveSource(json(snapshot({ sources: [source()] })));
    await flushMicrotasks();
    expect(screen.queryByText(t.stock.manualSourceAddedToast as string)).toBeNull();
  });

  it('ignores duplicate manual source additions while the first request is pending', async () => {
    let postCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'POST') {
        postCalls += 1;
        return new Promise<Response>(() => undefined);
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/duplicate' } });
    const sourceForm = input.closest('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(sourceForm);
      fireEvent.submit(sourceForm);
    });
    expect(postCalls).toBe(1);
  });

  it('keeps manual source submit inert for blank values and loading submits', async () => {
    let resolveSource: (response: Response) => void = () => {};
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveSource = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snapshot()));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    const sourceForm = input.closest('form') as HTMLFormElement;
    fireEvent.submit(sourceForm);
    fireEvent.change(input, { target: { value: 'file:///tmp/local-stock' } });
    expect(screen.queryByText((t.stock.manualSourceDetected as string).replace('{provider}', 'Studio X Shop'))).toBeNull();
    fireEvent.change(input, { target: { value: 'https://example.test/source/loading' } });
    fireEvent.submit(sourceForm);
    await waitFor(() => expect((within(sourceForm).getByRole('button', { name: t.stock.manualSourceAdd as string }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.submit(sourceForm);
    await act(async () => {
      resolveSource(json(snapshot()));
      await flushMicrotasks();
    });
  });

  it('does not show a provider preview for providers without a known host pattern', async () => {
    const snap = snapshot({
      providers: [provider({ id: 'unknown_provider', label: 'Unknown Provider' })],
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://example.test/source/unknown' } });
    expect(screen.queryByText((t.stock.manualSourceDetected as string).replace('{provider}', 'Unknown Provider'))).toBeNull();
  });

  it('cancels manual source deletion before the route is called', async () => {
    const snap = snapshot({ sources: [source()] });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json(snap);
      return json({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.cancel as string }));
    await flushMicrotasks();
    const sourceDeletes = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/stock/sources') && call[1]?.method === 'DELETE');
    expect(sourceDeletes).toHaveLength(0);
  });

  it('surfaces manual source delete HTTP errors', async () => {
    const snap = snapshot({ sources: [source()] });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock/sources') && init?.method === 'DELETE') return json({ error: 'manual source delete failed' }, 500);
      if (u.endsWith('/stock')) return json(snap);
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('manual source delete failed'))).toBe(true));
  });

  it('uses the generic manual source delete error when the route throws a non-Error value', async () => {
    const snap = snapshot({ sources: [source()] });
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'DELETE') return Promise.reject('plain source delete failure');
      if (u.endsWith('/stock')) return Promise.resolve(json(snap));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('ignores AbortError during manual source delete', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const snap = snapshot({ sources: [source()] });
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock/sources') && init?.method === 'DELETE') throw abortError;
      if (u.endsWith('/stock')) return json(snap);
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await flushMicrotasks();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops manual source delete completion after the VN id changes', async () => {
    let resolveDelete: (response: Response) => void = () => {};
    let deleteCalls = 0;
    const snap = snapshot({ sources: [source()] });
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'DELETE') {
        deleteCalls += 1;
        return new Promise<Response>((resolve) => { resolveDelete = resolve; });
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snap));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(deleteCalls).toBe(1));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second delete row' })] })} />);
    resolveDelete(json(snapshot({ sources: [] })));
    await flushMicrotasks();
    expect(screen.queryByText(t.stock.manualSourceDeletedToast as string)).toBeNull();
  });

  it('ignores duplicate manual source deletions while the confirmation is open', async () => {
    const snap = snapshot({ sources: [source()] });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const removeButton = await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` });
    act(() => {
      removeButton.click();
      removeButton.click();
    });
    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1);
  });

  it('shows the manual source pending indicator while deletion is in flight', async () => {
    let deleteCalls = 0;
    const snap = snapshot({ sources: [source()] });
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock/sources') && init?.method === 'DELETE') {
        deleteCalls += 1;
        return new Promise<Response>(() => undefined);
      }
      if (u.endsWith('/stock')) return Promise.resolve(json(snap));
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(deleteCalls).toBe(1));
    expect(screen.getByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }).querySelector('.animate-spin')).toBeTruthy();
  });

  it('falls back to reloading after clear-cache returns no snapshot and drops stale reloads', async () => {
    let resolveLoad: (response: Response) => void = () => {};
    let getCalls = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: [] }));
      if (u.endsWith('/stock') && init?.method === 'DELETE') return Promise.resolve(json({ cleared: true }));
      if (u.endsWith('/stock')) {
        getCalls += 1;
        if (getCalls === 1) return new Promise<Response>((resolve) => { resolveLoad = resolve; });
        return Promise.resolve(json(snapshot()));
      }
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(getCalls).toBe(1));
    view.rerender(<StockPanel vnId="v90002" initialSnapshot={snapshot({ offers: [offer({ vn_id: 'v90002', title: 'Second cache row' })] })} />);
    await act(async () => {
      resolveLoad(json(snapshot({ offers: [offer({ title: 'Stale cache reload row' })] })));
      await flushMicrotasks();
    });
    expect(screen.queryByText(t.stock.cacheClearedToast as string)).toBeNull();
    expect(screen.queryByText('Stale cache reload row')).toBeNull();
  });

  it('keeps the only selectable provider selected and renders unknown manual-source labels', async () => {
    const snap = snapshot({
      providers: [provider()],
      sources: [source({ provider: 'unknown_shop', product_id: null, url: 'not-a-url' })],
      offers: [
        offer({
          provider_offer_id: 'custom-labels',
          title: 'Custom labels copy',
          availability_label: 'Custom Availability',
          condition: 'Custom Condition',
          edition_label: 'Custom Edition',
          match_confidence: 'medium',
        }),
      ],
      summary: { total: 1, available: 1, best_price: 1980, related_available: 1, needs_review: 1, rejected: 1, last_refresh: Date.now() },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    const tile = screen.getByRole('button', { name: /Studio X Shop:/ });
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    expect(screen.getByText('unknown_shop')).toBeTruthy();
    expect(screen.getByText('not-a-url')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.groupNeedsReview as string) }));
    expect(screen.getByText('Custom Availability')).toBeTruthy();
    expect(screen.getByText('Custom Condition')).toBeTruthy();
    expect(screen.getByText('Custom Edition')).toBeTruthy();
    expect(screen.getByText(t.stock.matchConfidence.medium as string)).toBeTruthy();
    expect(screen.getByText((t.stock.relatedAvailableCount as string).replace('{count}', '1'))).toBeTruthy();
    expect(screen.getByText((t.stock.needsReviewCount as string).replace('{count}', '1'))).toBeTruthy();
    expect(screen.getByText((t.stock.rejectedCount as string).replace('{count}', '1'))).toBeTruthy();
  });

  it('keeps stale filtering safe before the first stock snapshot arrives', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return Promise.resolve(json({ aliases: ['Loaded Alias'] }));
      if (u.endsWith('/stock')) return new Promise<Response>(() => undefined);
      return Promise.resolve(json({}));
    }) as unknown as typeof fetch;
    renderWithProviders(<StockPanel vnId="v90001" />);
    fireEvent.click(screen.getByRole('button', { name: t.stock.hideStale as string }));
    await waitFor(() => expect(screen.getByRole('button', { name: t.stock.showStale as string })).toBeTruthy());
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    await screen.findByText('Loaded Alias');
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('leaves provider selection unchanged when physical and aggregate groups have no matches', async () => {
    const snap = snapshot({
      providers: [provider({ id: 'direct_only', label: 'Direct Only', kind: 'direct' })],
      statuses: [status({ provider: 'direct_only' })],
      offers: [offer({ provider: 'direct_only', provider_label: 'Direct Only' })],
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    const countBefore = screen.getByText((t.stock.providerSelectedCount as string).replace('{selected}', '1').replace('{total}', '1'));
    fireEvent.click(screen.getByRole('button', { name: t.stock.groupPhysical as string }));
    expect(countBefore).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.stock.providersAggregate as string }));
    expect(screen.getByText((t.stock.providerSelectedCount as string).replace('{selected}', '1').replace('{total}', '1'))).toBeTruthy();
  });

  it('excludes confirmed physical offers without a physical location from the locations widget', async () => {
    const snap = snapshot({
      providers: [
        provider({
          id: 'physical_shop',
          label: 'Physical Shop',
          physical: true,
          confirmedPhysicalUsable: true,
          physicalStockMode: 'exact_online',
        }),
      ],
      statuses: [status({ provider: 'physical_shop' })],
      offers: [
        offer({
          provider: 'physical_shop',
          provider_label: 'Physical Shop',
          location_label: null,
          availability: 'in_stock',
        }),
        offer({
          provider_offer_id: 'physical-limited',
          provider: 'physical_shop',
          provider_label: 'Physical Shop',
          location_label: 'Osaka branch',
          location_branch: 'Osaka branch',
          availability: 'limited',
        }),
      ],
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    await waitFor(() => expect(screen.getByTestId('physical-locations').textContent).toBe('1'));
  });

  it('renders provider fallback capability labels and disabled cached provider states', async () => {
    const snap = snapshot({
      providers: [
        provider({ id: 'fallback_direct', label: 'Fallback Direct', kind: 'direct', resultCapability: undefined, lookupCapabilities: [] }),
        provider({ id: 'fallback_aggregate', label: 'Fallback Aggregate', kind: 'aggregate', resultCapability: undefined, lookupCapabilities: [] }),
        provider({ id: 'fallback_cached', label: 'Fallback Cached', kind: 'cached', resultCapability: undefined, lookupCapabilities: [], disabled: true }),
        provider({ id: 'untitled_ok', label: 'Untitled OK', kind: 'direct', resultCapability: undefined, lookupCapabilities: [] }),
      ],
      statuses: [
        status({ provider: 'fallback_direct', offer_count: 0 }),
        status({ provider: 'fallback_aggregate', offer_count: 0 }),
        status({ provider: 'untitled_ok', status: 'ok', fetched_at: 0, offer_count: 1 }),
      ],
      offers: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    expect(screen.getByRole('button', { name: new RegExp(`Fallback Direct: ${t.stock.providersDirect}`) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`Fallback Aggregate: ${t.stock.providersAggregate}`) })).toBeTruthy();
    expect(screen.getByText(t.stock.providerDisabled as string)).toBeTruthy();
    const cachedTile = screen.getByRole('button', { name: new RegExp(`Fallback Cached: ${t.stock.providerCached}`) });
    expect((cachedTile as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: new RegExp(`Untitled OK: ${t.stock.providersDirect}`) }).closest('div')?.getAttribute('title')).toBeNull();
  });

  it('renders source URL fallback links and uncommon stock offer labels', async () => {
    const snap = snapshot({
      sources: [source({ product_id: null, url: 'https://example.test/source/fallback-url' })],
      offers: [
        offer({
          provider_offer_id: 'unknown-availability',
          title: 'Unknown availability copy',
          availability: 'unknown',
          availability_label: null,
          match_confidence: 'experimental',
          location_branch: 'Unmapped Shop',
          location_label: 'Unmapped Shop',
          price: null,
        }),
        offer({
          provider_offer_id: 'online-location',
          title: 'Online label copy',
          location_branch: null,
          location_label: ONLINE_STOCK_SENTINEL,
          availability: 'limited',
        }),
      ],
      summary: { total: 2, available: 1, best_price: null, related_available: 0, needs_review: 1, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const sourceLink = screen.getByRole('link', { name: 'https://example.test/source/fallback-url' });
    expect(sourceLink.getAttribute('href')).toBe('https://example.test/source/fallback-url');
    expect(screen.getByText(t.stock.availability.unknown as string)).toBeTruthy();
    expect(screen.getByText('experimental')).toBeTruthy();
    expect(screen.getByText('Unmapped Shop')).toBeTruthy();
    expect(screen.getByText(t.stock.onlineStockLabel as string)).toBeTruthy();
  });

  it('renders closed non-attention provider diagnostics with message fallbacks and no secondary badge', async () => {
    const snap = snapshot({
      providers: [provider({ id: 'quiet_shop', label: 'Quiet Shop' })],
      statuses: [
        status({ provider: 'quiet_shop', status: 'no_results', offer_count: 0 }),
      ],
      offers: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    const details = screen.getByText(t.stock.providerStatus as string).closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText(t.stock.providerStatus as string));
    await waitFor(() => expect(details.open).toBe(true));
    expect(screen.getAllByText(t.stock.providerDiagnostics.zeroOffersBadge as string).length).toBeGreaterThan(0);
    expect(screen.getByText(t.stock.providerDiagnostics.noResultsMessage as string)).toBeTruthy();
  });

  it('renders secondary provider diagnostics for protected cached stock', async () => {
    const snap = snapshot({
      providers: [provider({ id: 'surugaya', label: 'Suruga-ya' })],
      statuses: [
        status({
          provider: 'surugaya',
          status: 'protected',
          message: 'cloudflare challenge',
          offer_count: 1,
          cached_offers_available: 1,
        }),
      ],
      offers: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch(snap);
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    const details = screen.getByText(t.stock.providerStatus as string).closest('details') as HTMLDetailsElement;
    await waitFor(() => expect(details.open).toBe(true));
    expect(screen.getByText(t.stock.providerDiagnostics.latestProtectedNote as string)).toBeTruthy();
  });
});
