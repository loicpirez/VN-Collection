// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
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

const t = dictionaries.en;

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

/**
 * Advance through the 800ms autosave debounce, then flush the fetch ->
 * res.json() -> resolution -> toast microtask chain. Raw microtask flushes
 * are required here; advancing fake timers by 0 does not drain the promise
 * chain deeply enough for the success toast to paint.
 */
async function flushAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
}

describe('EditForm autosave side effects (fake timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires the favorite-added toast after toggling favorite and auto-saving', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const favSelect = screen.getByDisplayValue(t.common.no);
    await act(async () => { fireEvent.change(favSelect, { target: { value: '1' } }); });
    await flushAutosave();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(true);
    expect(screen.getAllByText(t.toast.favoriteAdded).length).toBeGreaterThan(0);
  });

  it('fires the marked-dumped toast after enabling dumped and auto-saving', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const dumpedCheckbox = screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) });
    await act(async () => { fireEvent.click(dumpedCheckbox); });
    await flushAutosave();
    expect(screen.getAllByText(t.toast.markedDumped).length).toBeGreaterThan(0);
  });

  it('surfaces an error alert + toast when the auto-save PATCH fails', async () => {
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'PATCH') return Promise.resolve(new Response(JSON.stringify({ error: 'autosave boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const statusSelect = screen.getByDisplayValue(t.status.playing);
    await act(async () => { fireEvent.change(statusSelect, { target: { value: 'completed' } }); });
    await flushAutosave();
    expect(screen.getAllByText('autosave boom').length).toBeGreaterThan(0);
  });

  it('shows the generic saved toast when a non-favorite, non-dumped field auto-saves', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const statusSelect = screen.getByDisplayValue(t.status.playing);
    await act(async () => { fireEvent.change(statusSelect, { target: { value: 'completed' } }); });
    await flushAutosave();
    expect(screen.getAllByText(t.toast.saved).length).toBeGreaterThan(0);
  });

  it('returns the save indicator to idle after the post-save delay', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } }); });
    await flushAutosave();
    // The saved badge shows, then the 2s idle timer reverts it to the hint.
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(t.form.autoSaveHint);
  });
});

describe('EditForm server reseed on prop change (fake timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('re-seeds the favorite + status fields when the vn prop changes and local state is clean', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByDisplayValue(t.common.no)).toBeInTheDocument();
    expect(screen.getByDisplayValue(t.status.playing)).toBeInTheDocument();
    // A sibling surface flips favorite + status on the server; router.refresh
    // delivers the new prop while the user has no in-flight edit.
    await act(async () => {
      rerender(<EditForm vn={makeVn({ favorite: true, status: 'completed' })} inCollection allSeries={allSeries} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByDisplayValue(t.form.favoriteYes)).toBeInTheDocument();
    expect(screen.getByDisplayValue(t.status.completed)).toBeInTheDocument();
  });
});

describe('EditForm places fetch + series edges (fake timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs (and does not throw) when the places fetch returns non-ok', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'places down' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(errSpy).toHaveBeenCalled();
    // The form still renders despite the failed places lookup.
    expect(screen.getByText(t.form.myTracking)).toBeInTheDocument();
  });

  it('hides the series select when every series is already attached', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const vn = makeVn({ series: [{ id: 1, name: 'Series One' }, { id: 2, name: 'Series Two' }] });
    renderWithProviders(<EditForm vn={vn} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByRole('combobox', { name: t.detail.addToSeries })).toBeNull();
  });

  it('renders the series-page link when no series exist at all', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={[]} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('link', { name: new RegExp(t.series.pageTitle) })).toBeInTheDocument();
  });
});

describe('EditForm not-in-collection add error (real timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        return Promise.resolve().then(() => new Response(JSON.stringify({ error: 'add failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the error message when adding the VN to the collection fails', async () => {
    renderWithProviders(<EditForm vn={makeVn()} inCollection={false} allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.form.add }));
    await waitFor(() => expect(screen.getAllByText('add failed').length).toBeGreaterThan(0));
  });
});

describe('EditForm series mutation errors (real timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces an error when adding the VN to a series fails', async () => {
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'POST') {
        return Promise.resolve().then(() => new Response(JSON.stringify({ error: 'series add boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    const select = await screen.findByRole('combobox', { name: t.detail.addToSeries });
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.detail.addToSeries }));
    await waitFor(() => expect(screen.getAllByText('series add boom').length).toBeGreaterThan(0));
  });

  it('surfaces an error when removing the VN from a series fails', async () => {
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'DELETE') {
        return Promise.resolve().then(() => new Response(JSON.stringify({ error: 'series remove boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const vn = makeVn({ series: [{ id: 1, name: 'Series One' }] });
    renderWithProviders(<EditForm vn={vn} inCollection allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(screen.getAllByText('series remove boom').length).toBeGreaterThan(0));
  });
});
