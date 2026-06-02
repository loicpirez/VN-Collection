// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';

let searchParamsValue = new URLSearchParams();
const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Cheap card stub so the heavy real VnCard tree stays out of the suite. */
vi.mock('@/components/VnCard', () => ({
  VnCard: ({
    data,
    selectable,
    selected,
    onSelect,
  }: {
    data: { id: string; title: string };
    selectable?: boolean;
    selected?: boolean;
    onSelect?: () => void;
  }) => (
    <div data-testid="vncard" data-id={data.id}>
      <span>{data.title}</span>
      {selectable && (
        <button type="button" aria-pressed={!!selected} onClick={onSelect}>
          Select {data.title}
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/BulkActionBar', () => ({
  BulkActionBar: ({
    selectedIds,
    onClear,
    onApplied,
  }: {
    selectedIds: string[];
    onClear: () => void;
    onApplied: () => void;
  }) => (
    <div data-testid="bulk-action-bar">
      <span>{selectedIds.join(',')}</span>
      <button type="button" onClick={onClear}>Clear selection mock</button>
      <button type="button" onClick={onApplied}>Apply selection mock</button>
    </div>
  ),
}));

vi.mock('@/components/SortableGrid', () => ({
  SortableGrid: ({
    items,
    disabled,
    onReorder,
  }: {
    items: { id: string; title: string }[];
    disabled?: boolean;
    onReorder: (ids: string[]) => void;
  }) => (
    <div data-testid="sortable-grid" data-disabled={disabled ? 'true' : 'false'}>
      {items.map((item) => <span key={item.id}>{item.title}</span>)}
      <button type="button" onClick={() => onReorder(items.map((item) => item.id).reverse())}>
        Reverse custom order
      </button>
    </div>
  ),
}));

vi.mock('@/components/BulkDownloadButton', () => ({
  BulkDownloadButton: ({ onItemDone }: { onItemDone?: () => void }) => (
    <button type="button" onClick={onItemDone}>Bulk download mock</button>
  ),
}));

vi.mock('@/components/RandomPickButton', () => ({
  RandomPickButton: ({ candidates }: { candidates: { id: string; title: string }[] }) => (
    <button type="button">Random mock {candidates.length}</button>
  ),
}));

vi.mock('@/components/SavedFilters', () => ({
  SAVED_FILTERS_OPEN_EVENT: 'vn:test-open-saved-filters',
  SavedFilters: () => <div data-testid="saved-filters-mock" />,
}));

import { LibraryClient } from '@/components/LibraryClient';

/** A row that satisfies the strict decodeCollectionCardItem guard. */
function cardRow(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    released: null,
    length_minutes: null,
    rating: null,
    developers: [],
    publishers: [],
    tags: [],
    relations: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    fetched_at: 1000,
    has_notes: false,
    list_count: 0,
    in_reading_queue: false,
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface RouterOptions {
  collectionItems?: ReturnType<typeof cardRow>[];
  collectionStatus?: number;
  collectionBody?: unknown;
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  playtimeMinutes?: number;
  byStatus?: { status: string; n: number }[];
  defaults?: { default_sort: string; default_order: 'asc' | 'desc'; default_group: string };
  settingsStatus?: number;
  producers?: { id: string; name: string; vn_count: number }[];
  publishers?: { id: string; name: string; vn_count: number }[];
  producersStatus?: number;
  series?: { id: number; name: string }[];
  seriesStatus?: number;
  knownPlaces?: string[];
  placesStatus?: number;
  collectionTags?: { id: string; name: string; vn_count: number }[];
  collectionTagsStatus?: number;
  tagPicker?: { id: string; name: string; category: 'cont' | 'ero' | 'tech'; vn_count: number }[];
  tagPickerStatus?: number;
  orderStatus?: number;
}

/** Route every endpoint LibraryClient touches to a valid decoder shape. */
function installFetchRouter(opts: RouterOptions = {}) {
  const items = opts.collectionItems ?? [];
  const defaults = opts.defaults ?? { default_sort: 'updated_at', default_order: 'desc', default_group: 'none' };
  global.fetch = vi.fn().mockImplementation((input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/settings')) {
      if (opts.settingsStatus && opts.settingsStatus >= 400) {
        return Promise.resolve(json({ error: 'settings boom' }, opts.settingsStatus));
      }
      return Promise.resolve(json(defaults));
    }
    if (url.startsWith('/api/producers')) {
      if (opts.producersStatus && opts.producersStatus >= 400) {
        return Promise.resolve(json({ error: 'producers boom' }, opts.producersStatus));
      }
      return Promise.resolve(json({ producers: opts.producers ?? [], publishers: opts.publishers ?? [] }));
    }
    if (url.startsWith('/api/series')) {
      if (opts.seriesStatus && opts.seriesStatus >= 400) {
        return Promise.resolve(json({ error: 'series boom' }, opts.seriesStatus));
      }
      return Promise.resolve(json({ series: opts.series ?? [] }));
    }
    if (url.startsWith('/api/places')) {
      if (opts.placesStatus && opts.placesStatus >= 400) {
        return Promise.resolve(json({ error: 'places boom' }, opts.placesStatus));
      }
      return Promise.resolve(json({ known_places: opts.knownPlaces ?? [] }));
    }
    if (url.startsWith('/api/collection/tags')) {
      if (opts.collectionTagsStatus && opts.collectionTagsStatus >= 400) {
        return Promise.resolve(json({ error: 'collection tags boom' }, opts.collectionTagsStatus));
      }
      return Promise.resolve(json({ tags: opts.collectionTags ?? [] }));
    }
    if (url.startsWith('/api/tags')) {
      if (opts.tagPickerStatus && opts.tagPickerStatus >= 400) {
        return Promise.resolve(json({ error: 'tag picker boom' }, opts.tagPickerStatus));
      }
      return Promise.resolve(json({ tags: opts.tagPicker ?? [] }));
    }
    if (url.startsWith('/api/collection/order')) {
      if (opts.orderStatus && opts.orderStatus >= 400) {
        return Promise.resolve(json({ error: 'order boom' }, opts.orderStatus));
      }
      return Promise.resolve(json({ ok: true }));
    }
    if (url.startsWith('/api/collection')) {
      if (opts.collectionStatus && opts.collectionStatus >= 400) {
        return Promise.resolve(json({ error: 'collection boom' }, opts.collectionStatus));
      }
      if (opts.collectionBody !== undefined) return Promise.resolve(json(opts.collectionBody));
      return Promise.resolve(json({
        items,
        stats: {
          total: opts.total ?? items.length,
          byStatus: opts.byStatus ?? [],
          playtime_minutes: opts.playtimeMinutes ?? 0,
        },
        pagination: {
          page: opts.page ?? 1,
          page_size: opts.pageSize ?? 240,
          returned: items.length,
          has_more: opts.hasMore ?? false,
        },
      }));
    }
    return Promise.resolve(json({}));
  });
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  localStorage.clear();
  document.cookie = 'vn_display_settings_v1=; path=/; max-age=0';
  installFetchRouter();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe('LibraryClient', () => {
  it('shows a loading skeleton on first paint then renders the fetched cards', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y'), cardRow('v90002', 'Title Z')] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    const cards = await screen.findAllByTestId('vncard');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Title Y')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/collection?'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('renders the empty-collection state after a resolved zero-result fetch', async () => {
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByRole('heading', { name: 'Empty collection' })).toBeInTheDocument();
    expect(screen.getByText('Add your first VN from the search page.')).toBeInTheDocument();
  });

  it('shows a filtered empty-state description when a filter is active', async () => {
    searchParamsValue = new URLSearchParams('status=completed');
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByRole('heading', { name: 'Empty collection' })).toBeInTheDocument();
    expect(screen.getByText('No result with these filters.')).toBeInTheDocument();
  });

  it('surfaces the collection error alert when the request fails', async () => {
    installFetchRouter({ collectionStatus: 500 });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByText('collection boom')).toBeInTheDocument();
  });

  it('surfaces the fallback collection error when the response shape is invalid', async () => {
    installFetchRouter({ collectionBody: { items: [], pagination: { page: 1 } } });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findAllByText('Error')).toHaveLength(2);
  });

  it('renders the toolbar search box in full mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    expect(container.querySelector('input[data-vn-search]')).not.toBeNull();
  });

  it('omits the grid in controls-only mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="controls-only" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/collection?'),
      expect.anything(),
    ));
    expect(container.querySelector('input[data-vn-search]')).not.toBeNull();
    expect(screen.queryByTestId('vncard')).not.toBeInTheDocument();
  });

  it('omits the toolbar search box in grid-only mode', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="grid-only" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByTestId('vncard')).toBeInTheDocument();
    expect(container.querySelector('input[data-vn-search]')).toBeNull();
  });

  it('forwards active URL filters into the collection request', async () => {
    searchParamsValue = new URLSearchParams('producer=p90001&q=hello');
    installFetchRouter({ collectionItems: [] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/api/collection?'),
      );
      expect(call).toBeTruthy();
      expect(call![0]).toContain('producer=p90001');
      expect(call![0]).toContain('q=hello');
    });
  });

  it('renders the status filter chips with the total on the All chip', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')], total: 7 });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    const allChip = within(group).getByRole('button', { name: /All/ });
    expect(allChip).toHaveTextContent('7');
    expect(allChip).toHaveAttribute('aria-pressed', 'true');
  });

  it('pushes a status filter into the URL when a status chip is clicked', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    await user.click(within(group).getByRole('button', { name: /Completed/ }));
    expect(replaceMock).toHaveBeenCalledWith('/?status=completed', { scroll: false });
  });

  it('clears the status filter back to the bare route when the active chip is reclicked', async () => {
    searchParamsValue = new URLSearchParams('status=completed');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const group = screen.getByRole('group', { name: 'Filter by status' });
    await user.click(within(group).getByRole('button', { name: /Completed/ }));
    expect(replaceMock).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('debounces search commits and trims the URL value', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    const input = container.querySelector<HTMLInputElement>('input[data-vn-search]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: '  hello  ' } });
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/?q=hello', { scroll: false }));
  });

  it('clears an existing search value through the search clear button', async () => {
    searchParamsValue = new URLSearchParams('q=seed');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/', { scroll: false }));
  });

  it('loads drawer facets on demand and applies a developer facet', async () => {
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y', { rating: 80, playtime_minutes: 600, dumped: true })],
      producers: [{ id: 'p90001', name: 'Dev House', vn_count: 2 }],
      publishers: [{ id: 'p90002', name: 'Pub House', vn_count: 1 }],
      series: [{ id: 77, name: 'Series One' }],
      knownPlaces: ['Desk shelf'],
      collectionTags: [{ id: 'g90001', name: 'Mystery', vn_count: 3 }],
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    const developer = await screen.findByRole('combobox', { name: 'Filter by developer' });
    await user.click(developer);
    await user.click(screen.getByRole('option', { name: /Dev House/ }));
    expect(replaceMock).toHaveBeenCalledWith('/?producer=p90001', { scroll: false });
  });

  it('applies publisher, series, tag, place, edition, and active-aspect drawer controls', async () => {
    searchParamsValue = new URLSearchParams('aspect=16:9');
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y')],
      producers: [{ id: 'p90001', name: 'Dev House', vn_count: 2 }],
      publishers: [{ id: 'p90002', name: 'Pub House', vn_count: 1 }],
      series: [{ id: 77, name: 'Series One' }],
      knownPlaces: ['Desk shelf'],
      collectionTags: [{ id: 'g90001', name: 'Mystery', vn_count: 3 }],
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    const publisher = await screen.findByRole('combobox', { name: 'Filter by publisher' });
    await user.click(publisher);
    await user.click(screen.getByRole('option', { name: /Pub House/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?aspect=16%3A9&publisher=p90002', { scroll: false });
    const series = screen.getByRole('combobox', { name: 'Filter by series' });
    await user.click(series);
    await user.click(screen.getByRole('option', { name: /Series One/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?aspect=16%3A9&series=77', { scroll: false });
    const tag = screen.getByRole('combobox', { name: 'Filter by tag' });
    await user.click(tag);
    await user.click(screen.getByRole('option', { name: /Mystery/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?aspect=16%3A9&tag=g90001', { scroll: false });
    const place = screen.getByRole('combobox', { name: 'Filter by physical location' });
    await user.click(place);
    await user.click(screen.getByRole('option', { name: /Desk shelf/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?aspect=16%3A9&place=Desk+shelf', { scroll: false });
    fireEvent.change(screen.getByLabelText('Filter by edition type'), { target: { value: 'physical' } });
    expect(replaceMock).toHaveBeenLastCalledWith('/?aspect=16%3A9&edition=physical', { scroll: false });
    const activeAspectButton = screen.getAllByRole('button', { name: /^16:9$/ }).find((button) => button.getAttribute('aria-pressed') === 'true');
    if (!activeAspectButton) throw new Error('active aspect button missing');
    fireEvent.click(activeAspectButton);
    expect(replaceMock).toHaveBeenLastCalledWith('/', { scroll: false });
  });

  it('reports facet and tag lookup failures through the toast layer', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')], producersStatus: 500 });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    expect(await screen.findByText('Error: producers boom')).toBeInTheDocument();

    cleanup();
    searchParamsValue = new URLSearchParams('tag=g90001');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')], tagPickerStatus: 500 });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByText('Error: tag picker boom')).toBeInTheDocument();
  });

  it('cycles advanced drawer filters, ranges, aspect, dump status, and resets flag filters', async () => {
    searchParamsValue = new URLSearchParams('match_vndb=1&match_egs=0');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await user.click(screen.getByRole('button', { name: '16:9' }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=1&match_egs=0&aspect=16%3A9', { scroll: false });
    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2001' } });
    fireEvent.keyDown(screen.getByLabelText('Min year'), { key: 'Enter' });
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=1&match_egs=0&yearMin=2001', { scroll: false });
    fireEvent.change(screen.getByLabelText('Max score'), { target: { value: '90' } });
    fireEvent.blur(screen.getByLabelText('Max score'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=1&match_egs=0&ratingMax=90', { scroll: false });
    fireEvent.change(screen.getByLabelText('Min hours'), { target: { value: '10' } });
    fireEvent.blur(screen.getByLabelText('Min hours'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=1&match_egs=0&playtimeMin=10', { scroll: false });
    await user.click(screen.getByRole('button', { name: /^Dumped$/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=1&match_egs=0&dumped=1', { scroll: false });
    await user.click(screen.getByRole('button', { name: /Has VNDB entry/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?match_vndb=0&match_egs=0', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'Reset all advanced filters' }));
    expect(replaceMock).toHaveBeenLastCalledWith('/', { scroll: false });
  });

  it('renders active filter chips with resolved labels and clears each range or entity filter', async () => {
    searchParamsValue = new URLSearchParams('producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16:9,4:3&ratingMin=60&playtimeMax=30&dumped=1');
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y', { rating: 80, playtime_minutes: 600, dumped: true })],
      producers: [{ id: 'p90001', name: 'Dev House', vn_count: 2 }],
      publishers: [{ id: 'p90002', name: 'Pub House', vn_count: 1 }],
      series: [{ id: 77, name: 'Series One' }],
      knownPlaces: ['Desk shelf'],
      collectionTags: [{ id: 'g90001', name: 'Mystery', vn_count: 3 }],
      tagPicker: [{ id: 'g90001', name: 'Mystery', category: 'cont', vn_count: 3 }],
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    await screen.findByText('Mystery');

    fireEvent.click(screen.getByRole('button', { name: /Dev House/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /Pub House/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /Series One/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /^2001-2003$/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    const aspectChip = screen.getAllByRole('button', { name: /^16:9$/ }).find((button) => button.getAttribute('title') === 'Clear all');
    if (!aspectChip) throw new Error('aspect chip missing');
    fireEvent.click(aspectChip);
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /^60-100$/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /^0-30h$/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /Mystery/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /Desk shelf/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: /^Physical$/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30&dumped=1', { scroll: false });
    const dumpedChip = screen.getAllByRole('button', { name: /^Dumped$/ }).find((button) => button.getAttribute('title') === 'Clear all');
    if (!dumpedChip) throw new Error('dumped chip missing');
    fireEvent.click(dumpedChip);
    expect(replaceMock).toHaveBeenLastCalledWith('/?producer=p90001&publisher=p90002&series=77&tag=g90001&place=Desk+shelf&edition=physical&yearMin=2001&yearMax=2003&aspect=16%3A9%2C4%3A3&ratingMin=60&playtimeMax=30', { scroll: false });
  });

  it('clears all filters through the toolbar options menu and dispatches saved-filter events', async () => {
    searchParamsValue = new URLSearchParams('q=seed');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const savedListener = vi.fn();
    window.addEventListener('vn:test-open-saved-filters', savedListener);
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: 'Library toolbar options' }));
    await user.keyboard('{ArrowDown}{End}{Home}');
    await user.click(screen.getByRole('menuitem', { name: 'Presets' }));
    expect(savedListener).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Library toolbar options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save current filter as preset' }));
    expect(savedListener).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { action: 'save' } }));
    await user.click(screen.getByRole('button', { name: 'Library toolbar options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reset filters' }));
    expect(replaceMock).toHaveBeenLastCalledWith('/', { scroll: false });
    window.removeEventListener('vn:test-open-saved-filters', savedListener);
  });

  it('closes the toolbar options and mobile sort drawer with keyboard handling', async () => {
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y')] });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: 'Library toolbar options' }));
    expect(screen.getByRole('menu', { name: 'Library toolbar options' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Library toolbar options' })).not.toBeInTheDocument());
    const sortViewButton = screen.getByRole('button', { name: 'Sort & view' });
    await user.click(sortViewButton);
    expect(sortViewButton).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(sortViewButton).toHaveAttribute('aria-expanded', 'false'));
  });

  it('applies toolbar sort, group, order, custom-sort, density, and select-mode controls', async () => {
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y'), cardRow('v90002', 'Title Z')],
      total: 2,
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findAllByTestId('vncard');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'title' } });
    expect(replaceMock).toHaveBeenLastCalledWith('/?sort=title', { scroll: false });
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'publisher' } });
    expect(replaceMock).toHaveBeenLastCalledWith('/?group=publisher', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'Descending' }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?order=asc', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'Reorder' }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?sort=custom', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'Comfortable' }));
    expect(screen.getByRole('button', { name: 'Dense' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Title Y' }));
    expect(screen.getByTestId('bulk-action-bar')).toHaveTextContent('v90001');
    await user.click(screen.getByRole('button', { name: 'Apply selection mock' }));
    await user.click(screen.getByRole('button', { name: 'Clear selection mock' }));
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
  });

  it('persists custom order changes and can reset the custom order', async () => {
    searchParamsValue = new URLSearchParams('sort=custom');
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y'), cardRow('v90002', 'Title Z')],
      total: 2,
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('sortable-grid');
    await user.click(screen.getByRole('button', { name: 'Reverse custom order' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/collection/order',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ ids: ['v90002', 'v90001'] }),
      }),
    ));
    await user.click(screen.getByRole('button', { name: 'Reset order' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/collection/order',
      expect.objectContaining({ method: 'DELETE' }),
    ));
  });

  it('rolls back and shows an error when custom order persistence fails', async () => {
    searchParamsValue = new URLSearchParams('sort=custom');
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y'), cardRow('v90002', 'Title Z')],
      total: 2,
      orderStatus: 500,
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('sortable-grid');
    await user.click(screen.getByRole('button', { name: 'Reverse custom order' }));
    expect(await screen.findByText('Error: order boom')).toBeInTheDocument();
  });

  it('renders grouped sections across status, producer, publisher, tag, series, aspect, year, place, and edition modes', async () => {
    const rows = [
      cardRow('v90001', 'Alpha', {
        status: 'completed',
        developers: [{ id: 'p90001', name: 'Dev House' }],
        publishers: [{ id: 'p90002', name: 'Pub House' }],
        tags: [{ id: 'g90001', name: 'Mystery', rating: 2, spoiler: 0, category: 'cont' }],
        series: [{ id: 77, name: 'Series One' }],
        aspect_keys: ['16:9'],
        released: '2001-01-01',
        physical_location: ['Desk shelf'],
        edition_type: 'physical',
      }),
      cardRow('v90002', 'Beta', { status: 'planning', released: null }),
    ];
    for (const [query, heading] of [
      ['group=status', 'Completed'],
      ['group=producer', 'Dev House'],
      ['group=publisher', 'Pub House'],
      ['group=tag', 'Mystery'],
      ['group=series', 'Series One'],
      ['group=aspect', '16:9'],
      ['group=year', '2001'],
      ['group=place', 'Desk shelf'],
      ['group=edition', 'Physical'],
    ] as const) {
      cleanup();
      searchParamsValue = new URLSearchParams(query);
      installFetchRouter({ collectionItems: rows, total: rows.length });
      renderWithProviders(
        <DisplaySettingsProvider>
          <LibraryClient mode="full" />
        </DisplaySettingsProvider>,
        { locale: 'en' },
      );
      expect(await screen.findByRole('heading', { name: new RegExp(heading) })).toBeInTheDocument();
    }
  });

  it('sorts grouped sections by group name and latest release', async () => {
    const rows = [
      cardRow('v90001', 'Alpha', { developers: [{ id: 'p90001', name: 'Zeta Dev' }], released: '2001-01-01' }),
      cardRow('v90002', 'Beta', { developers: [{ id: 'p90002', name: 'Alpha Dev' }], released: '2004-01-01' }),
    ];
    searchParamsValue = new URLSearchParams('group=producer&sort=producer&order=asc&groupSort=name');
    installFetchRouter({ collectionItems: rows, total: rows.length });
    const firstRender = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByRole('heading', { name: /Alpha Dev/ });
    const nameHeadings = firstRender.container.querySelectorAll('h2');
    expect(nameHeadings[0]).toHaveTextContent('Alpha Dev');

    cleanup();
    searchParamsValue = new URLSearchParams('group=producer&order=desc&groupSort=released');
    installFetchRouter({ collectionItems: rows, total: rows.length });
    const secondRender = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByRole('heading', { name: /Alpha Dev/ });
    const releaseHeadings = secondRender.container.querySelectorAll('h2');
    expect(releaseHeadings[0]).toHaveTextContent('Alpha Dev');
  });

  it('renders virtualized large grids and reacts to scroll measurements', async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn() as typeof window.cancelAnimationFrame;
    const rows = Array.from({ length: 120 }, (_, index) => cardRow(`v9${String(index + 1).padStart(4, '0')}`, `VN ${index + 1}`));
    installFetchRouter({ collectionItems: rows, total: rows.length });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByText('VN 1');
    const grid = container.querySelector<HTMLElement>('[data-virtualized-library-grid="true"]');
    expect(grid).not.toBeNull();
    Object.defineProperty(grid!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 900, top: 10, left: 0, right: 900, bottom: 800, height: 790, x: 0, y: 10, toJSON: () => ({}) }),
    });
    window.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(grid).toHaveAttribute('aria-rowcount'));
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('updates status via the all chip and group-sort selector', async () => {
    searchParamsValue = new URLSearchParams('status=completed&group=status');
    installFetchRouter({ collectionItems: [cardRow('v90001', 'Title Y', { status: 'completed' })], total: 1 });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await user.click(screen.getByRole('button', { name: /All/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?group=status', { scroll: false });
    fireEvent.change(screen.getByLabelText('Sort groups'), { target: { value: 'released' } });
    expect(replaceMock).toHaveBeenLastCalledWith('/?status=completed&group=status&groupSort=released', { scroll: false });
  });

  it('filters visible items by score, playtime, boolean flags, and hidden adult settings', async () => {
    localStorage.setItem('vn_display_settings_v1', JSON.stringify({ hideSexual: true, nsfwThreshold: 1.5 }));
    searchParamsValue = new URLSearchParams('ratingMin=70&ratingMax=90&playtimeMin=3&playtimeMax=6&match_vndb=1&match_egs=1&fan_disc=0&has_notes=1&has_custom_cover=1&has_banner=1&is_favorite=1&has_released=1&is_nsfw=0&is_nukige=0&in_reading_queue=1&in_list=1');
    installFetchRouter({
      collectionItems: [
        cardRow('v90001', 'Visible', {
          rating: 80,
          user_rating: 90,
          playtime_minutes: 240,
          egs: { egs_id: 123, median: 70, average: 72, count: 10, playtime_median_minutes: 300, source: 'search', okazu: false, erogame: false },
          relations: [],
          tags: [{ id: 'g90001', name: 'Comedy', rating: 2, spoiler: 0, category: 'cont' }],
          has_notes: true,
          custom_cover: '/cover.jpg',
          banner_image: '/banner.jpg',
          favorite: true,
          released: '2001-01-01',
          in_reading_queue: true,
          list_count: 1,
        }),
        cardRow('v90002', 'Adult hidden', {
          image_sexual: 2,
          rating: 80,
          playtime_minutes: 240,
          egs: { egs_id: 456, median: 70, average: 72, count: 10, playtime_median_minutes: 300, source: 'search', okazu: false, erogame: false },
          has_notes: true,
          custom_cover: '/cover2.jpg',
          banner_image: '/banner2.jpg',
          favorite: true,
          released: '2001-01-01',
          in_reading_queue: true,
          list_count: 1,
        }),
        cardRow('v90003', 'Outside score', { rating: 50, playtime_minutes: 240 }),
      ],
      total: 3,
    });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    expect(await screen.findByText('Visible')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Adult hidden')).not.toBeInTheDocument());
    expect(screen.queryByText('Outside score')).not.toBeInTheDocument();
    expect(screen.getByText(/hidden by the "sexual content" filter/)).toBeInTheDocument();
  });

  it('renders pagination for later pages and updates page params', async () => {
    searchParamsValue = new URLSearchParams('page=2');
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y')],
      page: 2,
      pageSize: 10,
      hasMore: true,
      total: 21,
    });
    const { user } = renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    expect(screen.getByText('Items 11 to 11')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Previous/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/', { scroll: false });
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(replaceMock).toHaveBeenLastCalledWith('/?page=3', { scroll: false });
  });

  it('uses settings defaults when URL sort and group params are absent and logs settings failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installFetchRouter({
      collectionItems: [cardRow('v90001', 'Title Y')],
      defaults: { default_sort: 'title', default_order: 'asc', default_group: 'status' },
    });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await waitFor(() => {
      const matched = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
        typeof c[0] === 'string' &&
        c[0].startsWith('/api/collection?') &&
        String(c[0]).includes('sort=title') &&
        String(c[0]).includes('order=asc'),
      );
      expect(matched).toBe(true);
    });
    await waitFor(() => expect(screen.getByLabelText('Group by')).toHaveValue('status'));

    cleanup();
    errorSpy.mockClear();
    installFetchRouter({ settingsStatus: 500, collectionItems: [cardRow('v90001', 'Title Y')] });
    renderWithProviders(
      <DisplaySettingsProvider>
        <LibraryClient mode="full" />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );
    await screen.findByTestId('vncard');
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
      '[LibraryClient] settings fetch failed:',
      expect.any(Error),
    ));
  });
});
