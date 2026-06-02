// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPanel } from '@/components/StockPanel';
import type { StockOfferDto, StockProviderDto, StockSnapshotDto, StockStatusDto } from '@/lib/stock-api-types';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** ErogePricePanel pulls recharts; it has its own dedicated test. */
vi.mock('@/components/ErogePricePanel', () => ({
  ErogePricePanel: ({ vnId }: { vnId: string }) => <div data-testid="eroge-panel">{vnId}</div>,
}));

/** StockPhysicalLocations is a separate assigned component. */
vi.mock('@/components/StockPhysicalLocations', () => ({
  StockPhysicalLocations: ({ offers }: { offers: unknown[] }) => (
    <div data-testid="physical-locations">{offers.length}</div>
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];

function offer(over: Partial<StockOfferDto> = {}): StockOfferDto {
  return {
    vn_id: 'v90001',
    provider: 'surugaya',
    provider_label: 'Studio X Shop',
    provider_offer_id: 'off-1',
    source: 'search',
    title: 'Title Y',
    url: 'https://example.test/o/1',
    price: 1980,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: 'used',
    edition_label: null,
    location_label: null,
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: Date.now(),
    error: null,
    content_kind: 'game_package',
    platform: 'PC',
    edition_kind: 'standard',
    series_relation: 'exact_game',
    match_confidence: 'high',
    match_score: 90,
    match_warnings_json: null,
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: null,
    ...over,
  };
}

function provider(over: Partial<StockProviderDto> = {}): StockProviderDto {
  return {
    id: 'surugaya',
    label: 'Studio X Shop',
    kind: 'direct',
    lookupCapabilities: ['title_search'],
    resultCapability: 'structured_offers',
    supportLevel: 'supported',
    physical: false,
    physicalStockMode: 'online_only',
    cloudflare: false,
    branchParserImplemented: false,
    confirmedPhysicalUsable: false,
    disabled: false,
    ...over,
  };
}

function status(over: Partial<StockStatusDto> = {}): StockStatusDto {
  return {
    provider: 'surugaya',
    status: 'ok',
    message: null,
    fetched_at: Date.now(),
    offer_count: 1,
    blocked_kind: null,
    fresh_offers_found: 1,
    cached_offers_available: 0,
    ...over,
  };
}

function snapshot(over: Partial<StockSnapshotDto> = {}): StockSnapshotDto {
  return {
    offers: [offer()],
    statuses: [status()],
    providers: [provider()],
    sources: [],
    summary: { total: 1, available: 1, best_price: 1980, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Default fetch router: GET stock + aliases succeed with the given snapshot. */
function routeFetch(opts: {
  snapshot?: StockSnapshotDto;
  aliases?: string[];
  onPost?: (body: unknown) => Response | Promise<Response>;
  onDelete?: () => Response;
  aliasPost?: (body: unknown) => Response;
  sourcePost?: () => Response;
  sourceDelete?: () => Response;
  getFails?: boolean;
} = {}) {
  const snap = opts.snapshot ?? snapshot();
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.endsWith('/stock/aliases')) {
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return (opts.aliasPost ?? ((b: unknown) => json({ aliases: [...(opts.aliases ?? []), (b as { term: string }).term] })))(body);
      }
      return json({ aliases: opts.aliases ?? [] });
    }
    if (u.endsWith('/stock/sources')) {
      // Source add/remove return the raw snapshot DTO.
      if (method === 'POST') return (opts.sourcePost ?? (() => json(snap)))();
      if (method === 'DELETE') return (opts.sourceDelete ?? (() => json(snap)))();
    }
    if (u.endsWith('/stock')) {
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return (opts.onPost ?? (() => json(snap)))(body);
      }
      if (method === 'DELETE') return (opts.onDelete ?? (() => json({ snapshot: snap })))();
      if (opts.getFails) return new Response('boom', { status: 500 });
      return json(snap);
    }
    return json({});
  });
}

describe('StockPanel', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    try {
      localStorage.clear();
    } catch {}
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders from initialSnapshot without a GET load and shows summary + an offer card', async () => {
    global.fetch = routeFetch();
    renderWithProviders(<StockPanel vnId="v90001" title="Title Y" initialSnapshot={snapshot()} />);
    // Summary best-price chip is present (also echoed on the offer card).
    expect(screen.getAllByText((c) => /1[\s,. ]?980/.test(c)).length).toBeGreaterThan(0);
    // The offer card title renders (game group).
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
    // No GET /stock load was issued because initialSnapshot was supplied,
    // but the aliases fetch still runs on mount.
    const getStockCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => String(c[0]).endsWith('/stock') && (!c[1] || c[1].method === undefined),
    );
    expect(getStockCalls).toHaveLength(0);
  });

  it('loads the snapshot via GET on mount when no initialSnapshot is given', async () => {
    global.fetch = routeFetch();
    renderWithProviders(<StockPanel vnId="v90001" />);
    await waitFor(() =>
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]) === '/api/vn/v90001/stock')).toBe(true),
    );
    await waitFor(() => expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0));
  });

  it('shows an error alert when the initial load fails', async () => {
    global.fetch = routeFetch({ getFails: true });
    renderWithProviders(<StockPanel vnId="v90001" />);
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect((alert.textContent ?? '').includes(t.common.error as string)).toBe(true);
    });
  });

  it('renders the post-check empty state when there are no offers but statuses exist', async () => {
    global.fetch = routeFetch();
    renderWithProviders(
      <StockPanel
        vnId="v90001"
        initialSnapshot={snapshot({ offers: [], summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() } })}
      />,
    );
    await waitFor(() => expect(screen.getByText(t.stock.emptyAfterCheck as string)).toBeTruthy());
  });

  it('renders the no-price label and pristine empty hint when nothing has been checked', async () => {
    global.fetch = routeFetch();
    renderWithProviders(
      <StockPanel
        vnId="v90001"
        initialSnapshot={snapshot({ offers: [], statuses: [], summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null } })}
      />,
    );
    expect(screen.getByText(t.stock.noPrice as string)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(t.stock.empty as string)).toBeTruthy());
  });

  it('toggles hide-stale and renders the stale banner for an old last_refresh', async () => {
    const oldTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    global.fetch = routeFetch();
    renderWithProviders(
      <StockPanel
        vnId="v90001"
        initialSnapshot={snapshot({
          offers: [offer({ fetched_at: oldTime })],
          statuses: [status({ fetched_at: oldTime })],
          summary: { total: 1, available: 1, best_price: 1980, related_available: 0, needs_review: 0, rejected: 0, last_refresh: oldTime },
        })}
      />,
    );
    // Stale banner (status role) is shown for a >7d-old last refresh with offers.
    const stalePrefix = (t.stock.staleBanner as string).split('{ago}')[0];
    await waitFor(() => expect(screen.getByText((c) => c.startsWith(stalePrefix.slice(0, 20)))).toBeTruthy());
    // Toggle hide-stale on: offers from stale providers are filtered out.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.hideStale as string) }));
    await waitFor(() => expect(screen.getByText(t.stock.emptyAfterCheck as string)).toBeTruthy());
  });

  it('opens the provider setup, selects the aggregate group, and toggles a provider tile', async () => {
    global.fetch = routeFetch({
      snapshot: snapshot({
        providers: [provider({ id: 'surugaya' }), provider({ id: 'agg1', label: 'Aggregator One', kind: 'aggregate' })],
        statuses: [status({ provider: 'surugaya' }), status({ provider: 'agg1' })],
      }),
    });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot({
      providers: [provider({ id: 'surugaya' }), provider({ id: 'agg1', label: 'Aggregator One', kind: 'aggregate' })],
      statuses: [status({ provider: 'surugaya' }), status({ provider: 'agg1' })],
    })} />);
    // Open the providers disclosure.
    fireEvent.click(screen.getByText(t.stock.providers as string));
    // The "aggregate" group button selects only aggregate providers.
    fireEvent.click(screen.getByRole('button', { name: t.stock.providersAggregate as string }));
    expect(screen.getByRole('button', { name: t.stock.providersAggregate as string }).getAttribute('aria-pressed')).toBe('true');
    // Toggle the direct provider tile off via its pressed button.
    const tileButtons = screen.getAllByRole('button').filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('Studio X Shop'));
    expect(tileButtons.length).toBeGreaterThan(0);
    fireEvent.click(tileButtons[0]);
    // Selecting "all" restores the null selection.
    fireEvent.click(screen.getByRole('button', { name: t.stock.providersAll as string }));
    expect(screen.getByRole('button', { name: t.stock.providersAll as string }).getAttribute('aria-pressed')).toBe('true');
  });

  it('runs a bulk refresh, POSTs per provider, and calls router.refresh', async () => {
    const onPost = vi.fn(() => json(snapshot()));
    global.fetch = routeFetch({ onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    const posts = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/stock'));
    expect(posts.length).toBeGreaterThan(0);
    expect(JSON.parse(String(posts[0][1].body))).toHaveProperty('providers');
  });

  it('refreshes a single provider from its per-tile refresh button', async () => {
    const onPost = vi.fn(() => json(snapshot()));
    global.fetch = routeFetch({ onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    const refreshOnlyBtn = screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') });
    fireEvent.click(refreshOnlyBtn);
    await waitFor(() => expect(onPost).toHaveBeenCalled());
    // The router-side POST body targets exactly this one provider.
    const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(String(post![1].body))).toEqual({ providers: ['surugaya'] });
  });

  it('adds an alias from a suggestion and shows the success toast', async () => {
    const aliasPost = vi.fn((b: unknown) => json({ aliases: [(b as { term: string }).term] }));
    global.fetch = routeFetch({ aliasPost });
    renderWithProviders(
      <StockPanel vnId="v90001" title="Title Y" altTitle="Alt Title Z" initialSnapshot={snapshot()} />,
    );
    // Open the search-setup disclosure.
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    // The altTitle is offered as a suggestion chip.
    const suggestion = await screen.findByRole('button', { name: /Alt Title Z/ });
    fireEvent.click(suggestion);
    await waitFor(() => expect(screen.getByText(t.stock.aliasAddedToast as string)).toBeTruthy());
    expect(aliasPost).toHaveBeenCalled();
  });

  it('adds an alias from the free-text form', async () => {
    const aliasPost = vi.fn((b: unknown) => json({ aliases: [(b as { term: string }).term] }));
    global.fetch = routeFetch({ aliasPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'My Alias' } });
    // Both the alias and source forms expose an "Ajouter" button; scope to
    // the alias form via the input's enclosing <form>.
    const aliasForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(aliasPost).toHaveBeenCalled());
    // The router passes the already-parsed request body to the spy.
    expect(aliasPost.mock.calls[0][0]).toMatchObject({ term: 'My Alias', action: 'add' });
  });

  it('removes an alias after the confirm dialog is accepted', async () => {
    const aliasPost = vi.fn((b: unknown) => {
      const body = b as { action: string };
      return json({ aliases: body.action === 'delete' ? [] : ['Existing Alias'] });
    });
    global.fetch = routeFetch({ aliases: ['Existing Alias'], aliasPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    // The existing alias chip + its remove button render once aliases load.
    const removeBtn = await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string });
    fireEvent.click(removeBtn);
    // Accept the confirm dialog.
    const confirmBtn = await screen.findByRole('button', { name: t.common.confirm as string });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getByText(t.stock.aliasRemovedToast as string)).toBeTruthy());
  });

  it('adds a manual source URL via the source form', async () => {
    // POST /stock/sources returns the raw snapshot (not wrapped in { snapshot }).
    const sourcePost = vi.fn(() => json(snapshot()));
    global.fetch = routeFetch({ sourcePost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const urlInput = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(urlInput, { target: { value: 'https://www.suruga-ya.jp/product/detail/1' } });
    const sourceForm = urlInput.closest('form') as HTMLFormElement;
    fireEvent.click(within(sourceForm).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getByText(t.stock.manualSourceAddedToast as string)).toBeTruthy());
    expect(sourcePost).toHaveBeenCalled();
  });

  it('opens the clear-cache modal and performs the DELETE on confirm', async () => {
    const onDelete = vi.fn(() => json({ snapshot: snapshot({ offers: [], statuses: [] }) }));
    global.fetch = routeFetch({ onDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    // The lazy modal (next/dynamic) resolves asynchronously; wait for its dialog.
    const dialog = await screen.findByRole('dialog');
    // Confirm via the destructive button inside the dialog.
    const confirmBtn = within(dialog).getByRole('button', { name: t.stock.clearCache as string });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(t.stock.cacheClearedToast as string)).toBeTruthy());
  });

  it('renders the lazy ErogePricePanel when an eroge_price status carries extras', async () => {
    const extrasJson = JSON.stringify({
      schemaVersion: 1,
      selectedEpId: 90001,
      searchQuery: 'Title Y',
      refreshedAt: 1,
      candidates: [
        {
          epId: 90001,
          gameUrl: 'https://eroge-price.com/games/90001',
          fetchedAt: 1,
          detail: {
            id: 90001, title: 'Title Y', maker: null, genres: [],
            mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] },
            releaseDate: null, coverImageUrl: null, description: null, officialSiteUrl: null,
            brandSiteUrl: null, platform: null, ageRating: null, hasDownload: false, hasPackage: true,
            fanzaDownloadCid: null, fanzaPackageCid: null, downloadRetailers: [], packageRetailers: [],
          },
          priceStats: { allTimeMin: null, allTimeMax: null, allTimeMinNote: null, allTimeMaxNote: null, thirtyDayMin: null, thirtyDayMinNote: null },
          priceHistory: [], related: { connections: [], sameBrand: [] },
        },
      ],
    });
    const snap = snapshot({
      providers: [provider(), provider({ id: 'eroge_price', label: 'Eroge Price', kind: 'aggregate' })],
      statuses: [status(), status({ provider: 'eroge_price', extras_json: extrasJson })],
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    await waitFor(() => expect(screen.getByTestId('eroge-panel')).toBeTruthy());
  });

  it('renders the physical-locations block when a provider is confirmed physical-usable', async () => {
    const snap = snapshot({
      providers: [provider({ confirmedPhysicalUsable: true, physical: true })],
      offers: [offer({ location_label: 'Branch Alpha', location_branch: 'Branch Alpha' })],
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} placeMap={{ 'Branch Alpha': 3 }} />);
    await waitFor(() => expect(screen.getByTestId('physical-locations')).toBeTruthy());
  });

  it('paginates the game offer group when there are more than the page size', async () => {
    const many = Array.from({ length: 14 }, (_v, i) =>
      offer({ provider_offer_id: `off-${i}`, title: `Title ${i}`, url: `https://example.test/o/${i}` }),
    );
    const snap = snapshot({
      offers: many,
      summary: { total: 14, available: 14, best_price: 1980, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    // The game group's pagination nav appears (14 offers / 12 per page).
    const nav = await screen.findByRole('navigation', { name: new RegExp((t.stock.groupPaginationLabel as string).split('{group}')[0].trim()) });
    const next = within(nav).getByRole('button', { name: t.stock.nextPage as string });
    expect((next as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(next);
    expect((within(nav).getByRole('button', { name: t.stock.previousPage as string }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('stops an in-flight refresh when the stop button is pressed', async () => {
    let releasePost!: (r: Response) => void;
    const onPost = vi.fn(
      () =>
        new Promise<Response>((res) => {
          releasePost = res;
        }),
    );
    global.fetch = routeFetch({ onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    // While the POST is pending, the Stop button is shown.
    const stopBtn = await screen.findByRole('button', { name: t.stock.stop as string });
    fireEvent.click(stopBtn);
    // After stop, the Stop control disappears (refreshing reset to false).
    await waitFor(() => expect(screen.queryByRole('button', { name: t.stock.stop as string })).toBeNull());
    releasePost(json(snapshot()));
  });
});
