// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
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
});
