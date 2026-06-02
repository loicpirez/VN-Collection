// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EditForm } from '@/components/EditForm';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { CollectionItem, SeriesRow } from '@/lib/types';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function makeVn(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id: 'v90001',
    title: 'Title Y',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: [],
    platforms: [],
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    release_images: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    status: 'playing',
    user_rating: 80,
    playtime_minutes: 120,
    started_date: null,
    finished_date: null,
    notes: '',
    favorite: false,
    location: 'jp',
    edition_type: 'physical',
    edition_label: '',
    physical_location: [],
    box_type: 'none',
    download_url: '',
    dumped: false,
    dumped_ignored: false,
    series: [],
    ...overrides,
  } as unknown as CollectionItem;
}

const allSeries: SeriesRow[] = [
  { id: 1, name: 'Series One', description: null, cover_path: null, banner_path: null, created_at: 0, updated_at: 0 },
  { id: 2, name: 'Series Two', description: null, cover_path: null, banner_path: null, created_at: 0, updated_at: 0 },
];

function placesResponse() {
  return new Response(JSON.stringify({ known_places: ['Shelf A'] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('EditForm (not in collection)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue(placesResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the add CTA and POSTs to add the VN to the collection', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection={false} allSeries={allSeries} />);
    expect(screen.getByText(t.form.notInCollection)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp('Ajouter à la collection') }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'POST');
    expect(JSON.parse(call![1].body)).toEqual({ status: 'planning' });
  });
});

describe('EditForm (in collection)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue(placesResponse());
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the tracking, editions, notes and series groups', async () => {
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(t.form.myTracking)).toBeTruthy();
    expect(screen.getByText(t.form.inventoryTitle)).toBeTruthy();
    expect(screen.getByText(t.form.personalNotes)).toBeTruthy();
    expect(screen.getByText(t.detail.seriesSection)).toBeTruthy();
  });

  it('fetches known places on mount and feeds them to the editions tag input', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/places')).toBe(true);
  });

  it('auto-saves a status change via PATCH after the debounce', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const statusSelect = screen.getByDisplayValue(t.status.playing);
    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'completed' } });
      await vi.advanceTimersByTimeAsync(900);
    });
    const patch = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch![1].body)).toMatchObject({ status: 'completed' });
  });

  it('does not auto-save while the rating is invalid', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const ratingInput = screen.getByDisplayValue('80');
    await act(async () => {
      fireEvent.change(ratingInput, { target: { value: '5' } });
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(screen.getByText(t.form.errors.ratingRange)).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(false);
  });

  it('adds the VN to a series via POST', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    // Select via the combobox role; the add button shares the aria-label.
    const select = screen.getByRole('combobox', { name: t.detail.addToSeries });
    await act(async () => {
      fireEvent.change(select, { target: { value: '2' } });
    });
    const addBtn = screen.getByRole('button', { name: t.detail.addToSeries });
    await act(async () => {
      fireEvent.click(addBtn);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/series/2/vn/v90001' && c[1]?.method === 'POST')).toBe(true);
  });

  it('removes the VN from a series it already belongs to via DELETE', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const vn = makeVn({ series: [{ id: 1, name: 'Series One' }] });
    renderWithProviders(<EditForm vn={vn} inCollection allSeries={allSeries} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const removeBtn = screen.getByRole('button', { name: t.series.removeFromSeries });
    await act(async () => {
      fireEvent.click(removeBtn);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/series/1/vn/v90001' && c[1]?.method === 'DELETE')).toBe(true);
  });

});

describe('EditForm remove flow (real timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    // Resolve each request on a fresh microtask so the mutation
    // ownership refs settle exactly as they do against a real network
    // round-trip (an already-resolved promise collapses the timing).
    global.fetch = vi.fn().mockImplementation((url: string, init: RequestInit = {}) => {
      if (init.method === 'DELETE') {
        return Promise.resolve().then(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(placesResponse());
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the VN from the collection after confirm and navigates home', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />);
    const removeBtn = screen.getByRole('button', { name: new RegExp(t.form.remove) });
    await user.click(removeBtn);
    // Confirm dialog appears in a portal; click its confirm button.
    const confirmBtn = await screen.findByRole('button', { name: t.common.confirm });
    await user.click(confirmBtn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });
});
