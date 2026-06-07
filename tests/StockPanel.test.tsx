// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPanel } from '@/components/StockPanel';
import type { StockOfferDto, StockProviderDto, StockSnapshotDto, StockSourceDto, StockStatusDto } from '@/lib/stock-api-types';
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

function source(over: Partial<StockSourceDto> = {}): StockSourceDto {
  return {
    id: 1,
    vn_id: 'v90001',
    release_id: null,
    provider: 'surugaya',
    url: 'https://www.suruga-ya.jp/product/detail/1',
    product_id: '145000001',
    created_at: Date.now(),
    updated_at: Date.now(),
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

  it('shows an error alert when the initial load payload is malformed', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.endsWith('/stock/aliases')) return json({ aliases: [] });
      if (u.endsWith('/stock')) return json({ offers: [] });
      return json({});
    });
    renderWithProviders(<StockPanel vnId="v90001" />);
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect((alert.textContent ?? '').includes(t.common.error as string)).toBe(true);
    });
  });

  it('selects the physical provider group from provider setup', async () => {
    const snap = snapshot({
      providers: [
        provider({ id: 'physical_shop', label: 'Physical Shop', physical: true, physicalStockMode: 'exact_online', confirmedPhysicalUsable: true }),
        provider({ id: 'online_shop', label: 'Online Shop' }),
      ],
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: t.stock.groupPhysical as string }));
    expect(screen.getByRole('button', { name: t.stock.checkPhysical as string })).toBeTruthy();
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

  it('renders provider capability and disabled/cached badge variants', async () => {
    const snap = snapshot({
      offers: [],
      providers: [
        provider({
          id: 'cached',
          label: 'Cached Inventory',
          kind: 'cached',
          resultCapability: 'cached_offers',
        }),
        provider({
          id: 'jan_shop',
          label: 'JAN Shop',
          lookupCapabilities: ['jan_lookup'],
          resultCapability: 'structured_prices',
          supportLevel: 'limited',
        }),
        provider({
          id: 'manual_shop',
          label: 'Manual Shop',
          supportLevel: 'manual_only',
        }),
        provider({
          id: 'disabled_shop',
          label: 'Disabled Shop',
          disabled: true,
        }),
      ],
      statuses: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null },
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));

    expect(screen.getByText(t.stock.providerCapabilities.cached_offers as string)).toBeTruthy();
    // Cached providers (AliceNet et al.) are selectable like any other source;
    // with the default null selection every selectable tile is pressed.
    expect(screen.getByRole('button', { name: /Cached Inventory:/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Cached Inventory:/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getAllByText((content) => content.includes(t.stock.providerCapabilities.janLookup as string)).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes(t.stock.providerCapabilities.limited as string)).length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content.includes(t.stock.providerCapabilities.manualOnly as string)).length).toBeGreaterThan(0);
    expect(screen.getByText(t.stock.providerDisabled as string)).toBeTruthy();
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

  it('treats a cached provider (AliceNet) as selectable but never refreshable', async () => {
    const onPost = vi.fn(() => json(snapshot()));
    const snap = snapshot({
      offers: [],
      providers: [
        provider({ id: 'surugaya', label: 'Studio X Shop', kind: 'direct', physical: true }),
        provider({
          id: 'alicenet',
          label: 'AliceNet',
          kind: 'cached',
          lookupCapabilities: ['cached_inventory'],
          resultCapability: 'cached_offers',
          physical: true,
          physicalStockMode: 'exact_cached',
          confirmedPhysicalUsable: true,
        }),
      ],
      statuses: [],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: null },
    });
    global.fetch = routeFetch({ snapshot: snap, onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);
    fireEvent.click(screen.getByText(t.stock.providers as string));

    // The AliceNet tile is an enabled, selectable checkbox button.
    const aliceTile = screen.getByRole('button', { name: /^AliceNet:/ });
    expect(aliceTile.hasAttribute('disabled')).toBe(false);
    expect(aliceTile.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(aliceTile);
    expect(aliceTile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(aliceTile);
    expect(aliceTile.getAttribute('aria-pressed')).toBe('true');

    // Cached providers expose no per-tile live refresh affordance.
    expect(
      screen.queryByRole('button', {
        name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'AliceNet'),
      }),
    ).toBeNull();

    // A bulk refresh with AliceNet selected never POSTs the cached provider.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.check as string) }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    const postedProviders = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[1]?.method === 'POST' && String(c[0]).endsWith('/stock'))
      .flatMap((c) => JSON.parse(String(c[1].body)).providers as string[]);
    expect(postedProviders.length).toBeGreaterThan(0);
    expect(postedProviders).toContain('surugaya');
    expect(postedProviders).not.toContain('alicenet');
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

  it('cancels clear-cache and then surfaces a clear-cache error', async () => {
    const onDelete = vi.fn(() => json({ error: 'Clear failed' }, 500));
    global.fetch = routeFetch({ onDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.cancel as string }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('Clear failed'))).toBe(true));
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
    fireEvent.click(within(nav).getByRole('button', { name: t.stock.previousPage as string }));
    expect((within(nav).getByRole('button', { name: t.stock.previousPage as string }) as HTMLButtonElement).disabled).toBe(true);
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

  it('renders provider diagnostics groups, blocked retry selection, and technical details', async () => {
    const snap = snapshot({
      offers: [],
      providers: [
        provider({ id: 'geo', label: 'Geo Shop' }),
        provider({ id: 'parser_shop', label: 'Parser Shop' }),
        provider({ id: 'wondergoo', label: 'WonderGOO', physical: true, physicalStockMode: 'store_locator_only' }),
        provider({ id: 'nores', label: 'No Result Shop' }),
        provider({ id: 'notchecked', label: 'Not Checked Shop' }),
      ],
      statuses: [
        status({ provider: 'geo', status: 'error', message: 'HTTP 403 blocked', offer_count: 0, fresh_offers_found: 0 }),
        status({ provider: 'parser_shop', status: 'error', message: 'invalid html parser', offer_count: 0, fresh_offers_found: 0 }),
        status({ provider: 'wondergoo', status: 'skipped', message: 'missing source data', offer_count: 0, fresh_offers_found: 0 }),
        status({ provider: 'nores', status: 'ok', message: null, offer_count: 0, fresh_offers_found: 0 }),
      ],
      summary: { total: 0, available: 0, best_price: null, related_available: 0, needs_review: 0, rejected: 0, last_refresh: Date.now() },
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);

    await waitFor(() => expect(screen.getByText(t.stock.providerDiagnostics.groupBlocked as string)).toBeTruthy());
    expect(screen.getByText(t.stock.providerDiagnostics.groupAttention as string)).toBeTruthy();
    expect(screen.getByText(t.stock.providerDiagnostics.groupSkipped as string)).toBeTruthy();
    expect(screen.getByText(t.stock.providerDiagnostics.groupNoResults as string)).toBeTruthy();
    expect(screen.getByText(t.stock.providerDiagnostics.geoBlockedMessage as string)).toBeTruthy();
    expect(screen.getByText(t.stock.providerDiagnostics.parserErrorMessage as string)).toBeTruthy();

    fireEvent.click(screen.getByText(t.stock.providerDiagnostics.technicalDetails as string));
    expect(screen.getByText('Geo Shop: HTTP 403 blocked')).toBeTruthy();
    expect(screen.getByText('Parser Shop: invalid html parser')).toBeTruthy();

    fireEvent.click(screen.getByText(t.stock.providers as string));
    const blocked = screen.getByRole('button', { name: (t.stock.groupBlockedRetry as string).replace('{count}', '2') });
    fireEvent.click(blocked);
    const geoButton = screen.getByRole('button', { name: /Geo Shop:/ });
    expect(geoButton.getAttribute('aria-pressed')).toBe('true');
    const notChecked = screen.getByRole('button', { name: (t.stock.groupNotCheckedSelect as string).replace('{count}', '1') });
    fireEvent.click(notChecked);
    expect(screen.getByRole('button', { name: /Not Checked Shop:/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders manual source rows and deletes one after confirmation', async () => {
    const withSources = snapshot({
      sources: [
        source(),
        source({ id: 2, provider: 'unknown_provider', url: 'javascript:alert(1)', product_id: null }),
      ],
    });
    const afterDelete = snapshot({ sources: [] });
    const sourceDelete = vi.fn(() => json(afterDelete));
    global.fetch = routeFetch({ snapshot: withSources, sourceDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={withSources} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    await waitFor(() => expect(screen.getByText('145000001')).toBeTruthy());
    expect(screen.getByText('unknown_provider')).toBeTruthy();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(sourceDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(t.stock.manualSourceDeletedToast as string)).toBeTruthy());
  });

  it('cancels manual source deletion and surfaces delete failures', async () => {
    const withSources = snapshot({ sources: [source()] });
    const sourceDelete = vi.fn(() => json({ error: 'Delete failed' }, 500));
    global.fetch = routeFetch({ snapshot: withSources, sourceDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={withSources} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const deleteButton = await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` });
    fireEvent.click(deleteButton);
    fireEvent.click(await screen.findByRole('button', { name: t.common.cancel as string }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sourceDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(sourceDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('Delete failed'))).toBe(true));
  });

  it('shows and clears alias mutation errors without losing returned aliases', async () => {
    const aliasPost = vi.fn(() => json({ aliases: ['Server Alias'], error: 'Alias failed' }, 400));
    global.fetch = routeFetch({ aliasPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Bad Alias' } });
    const aliasForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('Alias failed'))).toBe(true));
    expect(screen.getByText('Server Alias')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Better Alias' } });
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBeNull());
  });

  it('surfaces malformed successful alias add payloads', async () => {
    const aliasPost = vi.fn(() => json({ ok: true }));
    global.fetch = routeFetch({ aliasPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.aliasPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Bad Shape Alias' } });
    const aliasForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(aliasForm).getByRole('button', { name: t.stock.aliasAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('surfaces malformed successful alias deletion payloads', async () => {
    const aliasPost = vi.fn(() => json({ ok: true }));
    global.fetch = routeFetch({ aliases: ['Existing Alias'], aliasPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: t.stock.aliasRemoveTerm as string }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('shows source mutation errors, previews known providers, and clears the error on edit', async () => {
    const snap = snapshot({
      providers: [provider(), provider({ id: 'melonbooks', label: 'Melonbooks' })],
    });
    const sourcePost = vi.fn(() => json({ error: 'Unsupported custom source' }, 400));
    global.fetch = routeFetch({ snapshot: snap, sourcePost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://www.melonbooks.co.jp/detail/detail.php?product_id=1' } });
    expect(screen.getByText((t.stock.manualSourceDetected as string).replace('{provider}', 'Melonbooks'))).toBeTruthy();
    const sourceForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(sourceForm).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes('Unsupported custom source'))).toBe(true));

    fireEvent.change(input, { target: { value: 'https://example.com/item' } });
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBeNull());
    expect(screen.queryByText((t.stock.manualSourceDetected as string).replace('{provider}', 'Melonbooks'))).toBeNull();
  });

  it('surfaces malformed successful manual source add payloads', async () => {
    const sourcePost = vi.fn(() => json({ ok: true }));
    global.fetch = routeFetch({ sourcePost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    const input = await screen.findByLabelText(t.stock.manualSourcePlaceholder as string);
    fireEvent.change(input, { target: { value: 'https://www.suruga-ya.jp/product/detail/1' } });
    const sourceForm = input.closest('form') as HTMLFormElement;
    fireEvent.click(within(sourceForm).getByRole('button', { name: t.stock.manualSourceAdd as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('surfaces single-provider refresh errors', async () => {
    const onPost = vi.fn(() => json({ error: 'Shop down' }, 503));
    global.fetch = routeFetch({ onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Shop down'));
  });

  it('surfaces malformed successful single-provider refresh payloads', async () => {
    const onPost = vi.fn(() => json({ ok: true }));
    global.fetch = routeFetch({ onPost });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot()} />);

    fireEvent.click(screen.getByText(t.stock.providers as string));
    fireEvent.click(screen.getByRole('button', { name: (t.stock.refreshOnlyProvider as string).replace('{provider}', 'Studio X Shop') }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(t.common.error as string));
  });

  it('falls back to a fresh GET when clear-cache returns no snapshot', async () => {
    const reloaded = snapshot({ offers: [offer({ title: 'Reloaded offer', provider_offer_id: 'reloaded' })] });
    const onDelete = vi.fn(() => json({}));
    global.fetch = routeFetch({ snapshot: reloaded, onDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snapshot({ offers: [offer({ title: 'Before clear' })] })} />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.stock.clearCache as string) }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.stock.clearCache as string }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Reloaded offer')).toBeTruthy());
  });

  it('surfaces malformed successful manual source deletion payloads', async () => {
    const withSources = snapshot({ sources: [source()] });
    const sourceDelete = vi.fn(() => json({ ok: true }));
    global.fetch = routeFetch({ snapshot: withSources, sourceDelete });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={withSources} />);

    fireEvent.click(screen.getByText(t.stock.searchSetup as string));
    fireEvent.click(await screen.findByRole('button', { name: `${t.stock.manualSourceDelete}: Studio X Shop` }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((node) => (node.textContent ?? '').includes(t.common.error as string))).toBe(true));
  });

  it('renders classified offer groups and translated offer metadata', async () => {
    localStorage.setItem('stock:ui:offers:v1', JSON.stringify({ game: true }));
    const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const offers: StockOfferDto[] = [
      offer({
        provider_offer_id: 'game',
        title: 'Game offer',
        source: 'direct',
        availability_label: 'Marketplace: ¥1,234',
        condition: 'Used (Rank B)',
        edition_label: 'Limited edition',
        location_branch: 'Branch Alpha',
        location_label: 'Online stock',
        jan: '4989061101573',
        marketplace_price: 1800,
        marketplace_count: 2,
        list_price: 3000,
        match_warnings_json: JSON.stringify(['bonus-only item', 'novel_title']),
        fetched_at: oldTime,
      }),
      offer({
        provider_offer_id: 'mystery',
        title: 'Mystery source offer',
        source: 'unknown_source',
        availability_label: 'Several',
      }),
      offer({
        provider_offer_id: 'review',
        title: 'Needs review offer',
        price: null,
        source: 'search',
        match_confidence: 'medium',
      }),
      offer({
        provider_offer_id: 'series',
        title: 'Series offer',
        source: 'manual',
        series_relation: 'sequel_or_pack',
      }),
      offer({
        provider_offer_id: 'related',
        title: 'Soundtrack offer',
        content_kind: 'soundtrack',
      }),
      offer({
        provider_offer_id: 'related-media',
        title: 'Related media offer',
        content_kind: 'related_media',
      }),
      offer({
        provider_offer_id: 'related-goods',
        title: 'Goods offer',
        series_relation: 'related_goods',
      }),
      offer({
        provider_offer_id: 'rejected',
        title: 'Rejected offer',
        availability: 'out_of_stock',
        match_confidence: 'low',
      }),
      offer({
        provider_offer_id: 'weak',
        title: 'Weak offer',
        match_confidence: 'reject',
      }),
    ];
    const snap = snapshot({
      offers,
      summary: { total: 9, available: 2, best_price: 1980, related_available: 3, needs_review: 1, rejected: 2, last_refresh: Date.now() },
    });
    global.fetch = routeFetch({ snapshot: snap });
    renderWithProviders(<StockPanel vnId="v90001" initialSnapshot={snap} placeMap={{ 'Branch Alpha': 42 }} />);

    const gameExpand = screen.getByRole('button', {
      name: (t.stock.groupExpandLabel as string).replace('{group}', t.stock.groupGame as string).replace('{count}', '3'),
    });
    fireEvent.click(gameExpand);
    expect(screen.getByText('Game offer')).toBeTruthy();
    expect(screen.getByText('Mystery source offer')).toBeTruthy();
    expect(screen.getByText(t.stock.availabilityLabels.several as string)).toBeTruthy();
    expect(screen.getByText((t.stock.source as string).replace('{source}', 'unknown_source'), { exact: false })).toBeTruthy();
    expect(screen.getByText('Related media offer')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.relatedMusic as string)).toBeTruthy();
    expect(screen.getAllByText((content) => content.includes('Marketplace') && content.includes('1') && content.includes('234')).length).toBeGreaterThan(0);
    expect(screen.getByText(t.stock.conditionLabels.used_rank_b as string)).toBeTruthy();
    expect(screen.getByText(t.stock.editionLabels.limited_edition as string)).toBeTruthy();
    expect(screen.getByText(t.stock.matchWarnings.bonus_only_item as string)).toBeTruthy();
    expect(screen.getByText(t.stock.matchWarnings.novel_title as string)).toBeTruthy();
    expect(screen.getByText(t.stock.staleHint as string)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Branch Alpha/ }).getAttribute('href')).toBe('/places/42');

    const groupCounts = new Map<string, string>([
      [t.stock.groupNeedsReview as string, '1'],
      [t.stock.groupSameSeries as string, '1'],
      [t.stock.groupRelated as string, '2'],
      [t.stock.groupRejected as string, '2'],
    ]);
    for (const [group, count] of groupCounts) {
      fireEvent.click(screen.getByRole('button', {
        name: (t.stock.groupExpandLabel as string).replace('{group}', group).replace('{count}', count),
      }));
    }
    expect(screen.getByText('Needs review offer')).toBeTruthy();
    expect(screen.getByText(t.stock.noPriceShort as string)).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.searchOnly as string)).toBeTruthy();
    expect(screen.getByText('Series offer')).toBeTruthy();
    expect(screen.getByText((t.stock.source as string).replace('{source}', t.stock.sourceLabels.manual as string), { exact: false })).toBeTruthy();
    expect(screen.getByText('Soundtrack offer')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.soundtrack as string)).toBeTruthy();
    expect(screen.getByText('Goods offer')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.relatedGoods as string)).toBeTruthy();
    expect(screen.getByText('Rejected offer')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.outOfStock as string)).toBeTruthy();
    expect(screen.getByText('Weak offer')).toBeTruthy();
    expect(screen.getByText(t.stock.notCountedReasons.weakMatch as string)).toBeTruthy();
  });
});
