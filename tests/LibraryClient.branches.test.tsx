// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data }: { data: { id: string; title: string } }) => (
    <div data-testid="vncard" data-id={data.id}><span>{data.title}</span></div>
  ),
}));
vi.mock('@/components/BulkActionBar', () => ({
  BulkActionBar: () => <div data-testid="bulk-action-bar" />,
}));
vi.mock('@/components/SortableGrid', () => ({
  SortableGrid: ({ items }: { items: { id: string; title: string }[] }) => (
    <div data-testid="sortable-grid">{items.map((i) => <span key={i.id}>{i.title}</span>)}</div>
  ),
}));
vi.mock('@/components/BulkDownloadButton', () => ({
  BulkDownloadButton: () => <button type="button">Bulk download mock</button>,
}));
vi.mock('@/components/RandomPickButton', () => ({
  RandomPickButton: () => <button type="button">Random mock</button>,
}));
vi.mock('@/components/SavedFilters', () => ({
  SAVED_FILTERS_OPEN_EVENT: 'vn:test-open-saved-filters',
  SavedFilters: () => <div data-testid="saved-filters-mock" />,
}));

import { LibraryClient } from '@/components/LibraryClient';

function cardRow(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, title, alttitle: null, image_url: null, image_thumb: null, image_sexual: null, released: null,
    length_minutes: null, rating: null, developers: [], publishers: [], tags: [], relations: [],
    local_image: null, local_image_thumb: null, custom_cover: null, banner_image: null, banner_position: null,
    cover_rotation: 0, banner_rotation: 0, fetched_at: 1000, has_notes: false, list_count: 0, in_reading_queue: false,
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function installFetchRouter(items: ReturnType<typeof cardRow>[]) {
  global.fetch = vi.fn().mockImplementation((input: string | Request) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
    if (url.startsWith('/api/producers')) return Promise.resolve(json({ producers: [], publishers: [] }));
    if (url.startsWith('/api/series')) return Promise.resolve(json({ series: [] }));
    if (url.startsWith('/api/places')) return Promise.resolve(json({ known_places: [] }));
    if (url.startsWith('/api/collection/tags')) return Promise.resolve(json({ tags: [] }));
    if (url.startsWith('/api/tags')) return Promise.resolve(json({ tags: [] }));
    if (url.startsWith('/api/collection')) {
      return Promise.resolve(json({
        items,
        stats: { total: items.length, byStatus: [], playtime_minutes: 0 },
        pagination: { page: 1, page_size: 240, returned: items.length, has_more: false },
      }));
    }
    return Promise.resolve(json({}));
  });
}

function renderLibrary() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <LibraryClient mode="full" />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  replaceMock.mockReset();
  localStorage.clear();
  document.cookie = 'vn_display_settings_v1=; path=/; max-age=0';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LibraryClient filter branches', () => {
  it('keeps only egs_ ids when only_egs_only=1 is active', async () => {
    searchParamsValue = new URLSearchParams('only_egs_only=1');
    installFetchRouter([
      cardRow('egs_555', 'Synthetic EGS'),
      cardRow('v90001', 'Real VNDB'),
    ]);
    renderLibrary();
    expect(await screen.findByText('Synthetic EGS')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Real VNDB')).not.toBeInTheDocument());
  });

  it('excludes items that have an EGS id when match_egs=0 (false-match branch)', async () => {
    searchParamsValue = new URLSearchParams('match_egs=0');
    installFetchRouter([
      cardRow('v90001', 'Has EGS', { egs: { egs_id: 123, median: 70, average: 70, count: 1, playtime_median_minutes: null, source: 'search', okazu: false, erogame: false } }),
      cardRow('v90002', 'No EGS'),
    ]);
    renderLibrary();
    expect(await screen.findByText('No EGS')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Has EGS')).not.toBeInTheDocument());
  });

  it('excludes a fan disc (orig relation) when fan_disc=0', async () => {
    searchParamsValue = new URLSearchParams('fan_disc=0');
    const origRelation = {
      id: 'v90100', title: 'Parent', alttitle: null, released: null, rating: null, votecount: null,
      length_minutes: null, languages: [], platforms: [], developers: [], publishers: [],
      image_url: null, image_thumb: null, image_sexual: null, relation: 'orig', relation_official: true,
    };
    installFetchRouter([
      cardRow('v90001', 'Fan Disc', { relations: [origRelation] }),
      cardRow('v90002', 'Standalone'),
    ]);
    renderLibrary();
    expect(await screen.findByText('Standalone')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Fan Disc')).not.toBeInTheDocument());
  });

  it('averages multiple score signals and applies the rating range', async () => {
    // Score = round((user_rating 90 + rating 50 + egs.median 70) / 3) = 70.
    searchParamsValue = new URLSearchParams('ratingMin=65&ratingMax=75');
    installFetchRouter([
      cardRow('v90001', 'Averaged In', {
        user_rating: 90, rating: 50,
        egs: { egs_id: 1, median: 70, average: 70, count: 1, playtime_median_minutes: null, source: 'search', okazu: false, erogame: false },
      }),
      // No score at all -> filterScore returns null -> excluded by ratingMin.
      cardRow('v90002', 'No Score'),
    ]);
    renderLibrary();
    expect(await screen.findByText('Averaged In')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('No Score')).not.toBeInTheDocument());
  });

  it('derives playtime from the EGS median when the local playtime is absent', async () => {
    // playtimeMin=4h. v90001 has no local playtime but EGS median 300min = 5h -> kept.
    searchParamsValue = new URLSearchParams('playtimeMin=4');
    installFetchRouter([
      // No local playtime_minutes (left undefined) -> falls back to EGS median.
      cardRow('v90001', 'EGS Playtime', {
        egs: { egs_id: 1, median: 70, average: 70, count: 1, playtime_median_minutes: 300, source: 'search', okazu: false, erogame: false },
      }),
      // length_minutes only, 60min = 1h -> below the 4h floor -> excluded.
      cardRow('v90002', 'Short Length', { length_minutes: 60 }),
    ]);
    renderLibrary();
    expect(await screen.findByText('EGS Playtime')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Short Length')).not.toBeInTheDocument());
  });

  it('treats an EGS okazu flag as adult content under the sexual-content filter', async () => {
    localStorage.setItem('vn_display_settings_v1', JSON.stringify({ hideSexual: true, nsfwThreshold: 1.5 }));
    installFetchRouter([
      cardRow('v90001', 'Clean'),
      cardRow('v90002', 'Okazu Adult', {
        egs: { egs_id: 1, median: 70, average: 70, count: 1, playtime_median_minutes: null, source: 'search', okazu: true, erogame: false },
      }),
    ]);
    renderLibrary();
    expect(await screen.findByText('Clean')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Okazu Adult')).not.toBeInTheDocument());
    // The filtered-out-adult notice surfaces.
    expect(screen.getByText(/hidden by the "sexual content" filter/)).toBeInTheDocument();
  });

  it('applies false-match library boolean filters without crashing', async () => {
    searchParamsValue = new URLSearchParams(
      'has_notes=0&has_custom_cover=0&has_banner=0&is_favorite=0&has_released=0&is_nsfw=0&is_nukige=0&in_reading_queue=0&in_list=0',
    );
    installFetchRouter([
      cardRow('v90001', 'Clean false-match row'),
      cardRow('v90002', 'Has Notes', { has_notes: true }),
      cardRow('v90003', 'Has Custom Cover', { custom_cover: '/cover.jpg' }),
      cardRow('v90004', 'Has Banner', { banner_image: '/banner.jpg' }),
      cardRow('v90005', 'Is Favorite', { favorite: true }),
      cardRow('v90006', 'Has Release Date', { released: '2001-01-01' }),
      cardRow('v90007', 'Is Adult', { tags: [{ id: 'g90007', name: 'Adult', rating: 2, spoiler: 0, category: 'ero' }] }),
      cardRow('v90008', 'Is Nukige', { tags: [{ id: 'g90008', name: 'Nukige', rating: 2, spoiler: 0, category: 'cont' }] }),
      cardRow('v90009', 'In Queue', { in_reading_queue: true }),
      cardRow('v90010', 'In List', { list_count: 1 }),
    ]);
    renderLibrary();
    expect(await screen.findByText('Clean false-match row')).toBeInTheDocument();
    for (const title of ['Has Notes', 'Has Custom Cover', 'Has Banner', 'Is Favorite', 'Has Release Date', 'Is Adult', 'Is Nukige', 'In Queue', 'In List']) {
      await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    }
  });

  it('applies rating and playtime max filters without crashing', async () => {
    searchParamsValue = new URLSearchParams('ratingMax=75&playtimeMax=4');
    installFetchRouter([
      cardRow('v90001', 'Within max filters', { rating: 70, playtime_minutes: 180 }),
      cardRow('v90002', 'Above score max', { rating: 90, playtime_minutes: 180 }),
      cardRow('v90003', 'Above playtime max', { rating: 70, playtime_minutes: 420 }),
      cardRow('v90004', 'No max filter values'),
    ]);
    renderLibrary();
    expect(await screen.findByText('Within max filters')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Above score max')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Above playtime max')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('No max filter values')).not.toBeInTheDocument());
  });

  it('commits every numeric range input through blur or Enter', async () => {
    installFetchRouter([cardRow('v90001', 'Input Commit Row')]);
    renderLibrary();
    await screen.findByText('Input Commit Row');
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    await screen.findByLabelText('Min year');

    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2001' } });
    fireEvent.blur(screen.getByLabelText('Min year'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?yearMin=2001', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max year'), { target: { value: '2005' } });
    fireEvent.keyDown(screen.getByLabelText('Max year'), { key: 'Enter' });
    expect(replaceMock).toHaveBeenLastCalledWith('/?yearMax=2005', { scroll: false });

    fireEvent.change(screen.getByLabelText('Min score'), { target: { value: '50' } });
    fireEvent.blur(screen.getByLabelText('Min score'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?ratingMin=50', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max score'), { target: { value: '90' } });
    fireEvent.keyDown(screen.getByLabelText('Max score'), { key: 'Enter' });
    expect(replaceMock).toHaveBeenLastCalledWith('/?ratingMax=90', { scroll: false });

    fireEvent.change(screen.getByLabelText('Min hours'), { target: { value: '3' } });
    fireEvent.blur(screen.getByLabelText('Min hours'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?playtimeMin=3', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max hours'), { target: { value: '7' } });
    fireEvent.keyDown(screen.getByLabelText('Max hours'), { key: 'Enter' });
    expect(replaceMock).toHaveBeenLastCalledWith('/?playtimeMax=7', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max hours'), { target: { value: '8' } });
    fireEvent.blur(screen.getByLabelText('Max hours'));
    expect(replaceMock).toHaveBeenLastCalledWith('/?playtimeMax=8', { scroll: false });

    const beforeIgnoredKey = replaceMock.mock.calls.length;
    for (const label of ['Min year', 'Max year', 'Min score', 'Max score', 'Min hours', 'Max hours']) {
      fireEvent.keyDown(screen.getByLabelText(label), { key: 'Escape' });
    }
    expect(replaceMock).toHaveBeenCalledTimes(beforeIgnoredKey);
  });

  it('renders collection rows with legacy nullable optional metadata', async () => {
    installFetchRouter([
      cardRow('v90001', 'Legacy nullable row', {
        status: null,
        favorite: null,
        edition_type: null,
        dumped: null,
        dumped_ignored: null,
        added_at: null,
        updated_at: null,
      }),
    ]);
    renderLibrary();
    expect(await screen.findByText('Legacy nullable row')).toBeInTheDocument();
  });

  it('shows a specific error when the collection endpoint returns a malformed success payload', async () => {
    global.fetch = vi.fn().mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
      if (url.startsWith('/api/collection')) return Promise.resolve(json({ items: 'not-an-array' }));
      return Promise.resolve(json({}));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderLibrary();
    expect(await screen.findByText('The collection response is invalid. Refresh after syncing or check the server.')).toBeInTheDocument();
  });

  it('ignores collection AbortError failures', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn().mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
      if (url.startsWith('/api/collection')) return Promise.reject(abortError);
      return Promise.resolve(json({}));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderLibrary();
    await waitFor(() => expect(screen.queryByText(/aborted/)).not.toBeInTheDocument());
  });

  it('uses the generic error when a collection failure has an empty message', async () => {
    global.fetch = vi.fn().mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
      if (url.startsWith('/api/collection')) return Promise.reject(new Error(''));
      return Promise.resolve(json({}));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderLibrary();
    expect(await screen.findAllByText('Error')).not.toHaveLength(0);
  });

  it('resolves a tag chip label from the tag picker payload', async () => {
    searchParamsValue = new URLSearchParams('tag=g90001');
    global.fetch = vi.fn().mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
      if (url.startsWith('/api/tags')) return Promise.resolve(json({ tags: [{ id: 'g90001', name: 'Resolved tag', category: 'cont', vn_count: 1 }] }));
      if (url.startsWith('/api/collection')) {
        return Promise.resolve(json({
          items: [cardRow('v90001', 'Tagged row')],
          stats: { total: 1, byStatus: [], playtime_minutes: 0 },
          pagination: { page: 1, page_size: 240, returned: 1, has_more: false },
        }));
      }
      return Promise.resolve(json({ producers: [], publishers: [], series: [], known_places: [], tags: [] }));
    });
    renderLibrary();
    expect(await screen.findByText('Tagged row')).toBeInTheDocument();
    expect(await screen.findByText('Resolved tag')).toBeInTheDocument();
  });

  it('loads facet options only when the advanced filter drawer opens', async () => {
    installFetchRouter([cardRow('v90001', 'Facet row')]);
    const { user } = renderLibrary();
    expect(await screen.findByText('Facet row')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    expect(global.fetch).toHaveBeenCalledWith('/api/producers', expect.objectContaining({ cache: 'no-store' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/series', expect.objectContaining({ cache: 'no-store' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/places', expect.objectContaining({ cache: 'no-store' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/collection/tags', expect.objectContaining({ cache: 'no-store' }));
  });

  it('reports malformed facet payloads without collapsing the library grid', async () => {
    global.fetch = vi.fn().mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ default_sort: 'updated_at', default_order: 'desc', default_group: 'none' }));
      if (url.startsWith('/api/producers')) return Promise.resolve(json({ producers: 'bad', publishers: [] }));
      if (url.startsWith('/api/series')) return Promise.resolve(json({ series: [] }));
      if (url.startsWith('/api/places')) return Promise.resolve(json({ known_places: [] }));
      if (url.startsWith('/api/collection/tags')) return Promise.resolve(json({ tags: [] }));
      if (url.startsWith('/api/collection')) {
        return Promise.resolve(json({
          items: [cardRow('v90001', 'Still visible')],
          stats: { total: 1, byStatus: [], playtime_minutes: 0 },
          pagination: { page: 1, page_size: 240, returned: 1, has_more: false },
        }));
      }
      return Promise.resolve(json({}));
    });
    const { user } = renderLibrary();
    expect(await screen.findByText('Still visible')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Filters/ }));
    expect(await screen.findByText('Error: Error')).toBeInTheDocument();
    expect(screen.getByText('Still visible')).toBeInTheDocument();
  });
});
