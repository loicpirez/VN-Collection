// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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

function makeSparseCollectionVn(): CollectionItem {
  const vn = makeVn();
  delete vn.status;
  delete vn.user_rating;
  delete vn.playtime_minutes;
  delete vn.started_date;
  delete vn.finished_date;
  delete vn.notes;
  delete vn.favorite;
  delete vn.location;
  delete vn.edition_type;
  delete vn.edition_label;
  delete vn.physical_location;
  delete vn.box_type;
  delete vn.download_url;
  delete vn.dumped;
  delete vn.dumped_ignored;
  return vn;
}

const allSeries: SeriesRow[] = [
  { id: 1, name: 'Series One', description: null, cover_path: null, banner_path: null, created_at: 0, updated_at: 0 },
  { id: 2, name: 'Series Two', description: null, cover_path: null, banner_path: null, created_at: 0, updated_at: 0 },
];

function placesResponse() {
  return new Response(JSON.stringify({ known_places: ['Shelf A'] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function okResponse() {
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
    vi.useRealTimers();
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

  it('fires the favorite-removed toast after untoggling favorite and auto-saving', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<EditForm vn={makeVn({ favorite: true })} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const favSelect = screen.getByDisplayValue(t.form.favoriteYes);
    await act(async () => { fireEvent.change(favSelect, { target: { value: '0' } }); });
    await flushAutosave();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(true);
    expect(screen.getAllByText(t.toast.favoriteRemoved).length).toBeGreaterThan(0);
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

  it('auto-saves the dumped-ignore preference without showing a dumped toast', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const ignoredCheckbox = screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) });
    await act(async () => { fireEvent.click(ignoredCheckbox); });
    await flushAutosave();
    const patch = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH');
    expect(JSON.parse(patch![1].body)).toMatchObject({ dumped_ignored: true });
    expect(screen.queryByText(t.toast.markedDumped)).toBeNull();
  });

  it('does not auto-save while playtime is invalid', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const playtimeInput = screen.getByDisplayValue('120');
    await act(async () => {
      fireEvent.change(playtimeInput, { target: { value: '-1' } });
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(screen.getByText(t.form.errors.playtimeInvalid)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(false);
  });

  it('clears a pending field when the payload becomes invalid before autosave', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } }); });
    expect(screen.getByRole('status', { name: t.form.saving })).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '-1' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.queryByRole('status', { name: t.form.saving })).toBeNull();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(false);
  });

  it('clears a pending field when a tracked value is reverted before autosave', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    expect(screen.getByRole('status', { name: t.form.saving })).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue(t.status.completed), { target: { value: 'playing' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(screen.queryByRole('status', { name: t.form.saving })).toBeNull();
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001' && c[1]?.method === 'PATCH')).toBe(false);
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

  it('keeps one pending status field when the same field changes twice before autosave', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const statusSelect = screen.getByDisplayValue(t.status.playing);
    await act(async () => {
      fireEvent.change(statusSelect, { target: { value: 'completed' } });
      fireEvent.change(statusSelect, { target: { value: 'dropped' } });
    });
    expect(screen.getByRole('status', { name: t.form.saving })).toBeInTheDocument();
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

  it('replaces an existing idle timer when another autosave succeeds', async () => {
    let patches = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'PATCH') {
        patches += 1;
        return Promise.resolve(okResponse());
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await flushAutosave();
    expect(patches).toBe(1);
    await act(async () => { fireEvent.change(screen.getByDisplayValue(t.status.completed), { target: { value: 'dropped' } }); });
    await flushAutosave();
    expect(patches).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(t.toast.saved);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(live?.textContent).toContain(t.form.autoSaveHint);
  });

  it('clears idle timers and skips autosave when the VN identity changes', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await flushAutosave();
    await act(async () => {
      rerender(<EditForm vn={makeVn({ id: 'v90002', title: 'Other VN' })} inCollection allSeries={allSeries} />);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(screen.getByDisplayValue(t.status.playing)).toBeInTheDocument();
  });

  it('flushes a pending autosave with keepalive on unmount', async () => {
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      if (String(url) === '/api/collection/v90001' && init?.method === 'PATCH') return Promise.resolve(okResponse());
      return Promise.resolve(placesResponse());
    });
    global.fetch = fetchMock;
    const view = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      view.unmount();
      await Promise.resolve();
      await Promise.resolve();
    });
    const patch = fetchMock.mock.calls.find((call) => call[0] === '/api/collection/v90001' && call[1]?.method === 'PATCH');
    expect(patch?.[1]?.keepalive).toBe(true);
  });

  it('skips an autosave commit while a collection action is reserved', async () => {
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      if (String(url) === '/api/collection/v90001' && init?.method === 'DELETE') return Promise.resolve(okResponse());
      if (String(url) === '/api/collection/v90001' && init?.method === 'PATCH') return Promise.resolve(okResponse());
      return Promise.resolve(placesResponse());
    });
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    fireEvent.click(screen.getByRole('button', { name: t.form.remove }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/collection/v90001' && call[1]?.method === 'PATCH')).toBe(false);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: t.common.cancel }));
  });

  it('ignores a stale autosave completion after a newer autosave owns the form', async () => {
    const firstPatch = deferredResponse();
    const secondPatch = deferredResponse();
    let patchCount = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'PATCH') {
        patchCount += 1;
        return patchCount === 1 ? firstPatch.promise : secondPatch.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(patchCount).toBe(1);
    fireEvent.change(screen.getByDisplayValue(t.status.completed), { target: { value: 'dropped' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(patchCount).toBe(2);
    await act(async () => {
      firstPatch.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(t.toast.saved)).toBeNull();
    await act(async () => {
      secondPatch.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText(t.toast.saved).length).toBeGreaterThan(0);
  });

  it('ignores abort, stale, and detached autosave failures', async () => {
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'PATCH') {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const abortView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Aborted')).toBeNull();
    abortView.unmount();

    const firstPatch = deferredResponse();
    const secondPatch = deferredResponse();
    let patchCount = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'PATCH') {
        patchCount += 1;
        return patchCount === 1 ? firstPatch.promise : secondPatch.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const staleView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    fireEvent.change(screen.getByDisplayValue(t.status.completed), { target: { value: 'dropped' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(patchCount).toBe(2);
    await act(async () => {
      firstPatch.reject(new Error('stale autosave failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('stale autosave failed')).toBeNull();
    await act(async () => {
      secondPatch.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    staleView.unmount();

    const detachedPatch = deferredResponse();
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'PATCH') {
        return detachedPatch.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const detachedView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    detachedView.unmount();
    await act(async () => {
      detachedPatch.reject(new Error('detached autosave failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('detached autosave failed')).toBeNull();
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

  it('re-seeds tracking and dumped fields when server props change and local state is clean', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      rerender(<EditForm
        vn={makeVn({
          user_rating: 95,
          playtime_minutes: 240,
          started_date: '2024-01-02',
          finished_date: '2024-01-10',
          dumped: true,
          dumped_ignored: true,
        })}
        inCollection
        allSeries={allSeries}
      />);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByDisplayValue('95')).toBeInTheDocument();
    expect(screen.getByDisplayValue('240')).toBeInTheDocument();
    expect(screen.getByText('January 2, 2024')).toBeInTheDocument();
    expect(screen.getByText('January 10, 2024')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) })).toBeChecked();
  });

  it('does not clobber dirty tracking and dumped drafts when server props change', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'dropped' } });
    fireEvent.change(screen.getByDisplayValue('80'), { target: { value: '55' } });
    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '999' } });
    fireEvent.change(screen.getByDisplayValue(t.common.no), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: t.form.startedDate }));
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.today }));
    fireEvent.click(screen.getByRole('button', { name: t.form.finishedDate }));
    fireEvent.click(screen.getByRole('button', { name: t.dateInput.today }));
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) }));
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) }));
    await act(async () => {
      rerender(<EditForm
        vn={makeVn({
          status: 'completed',
          user_rating: 95,
          playtime_minutes: 240,
          started_date: '2024-01-02',
          finished_date: '2024-01-10',
          favorite: false,
          dumped: false,
          dumped_ignored: false,
        })}
        inCollection
        allSeries={allSeries}
      />);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByDisplayValue(t.status.dropped)).toBeInTheDocument();
    expect(screen.getByDisplayValue('55')).toBeInTheDocument();
    expect(screen.getByDisplayValue('999')).toBeInTheDocument();
    expect(screen.queryByText('January 2, 2024')).toBeNull();
    expect(screen.queryByText('January 10, 2024')).toBeNull();
    expect(screen.getByDisplayValue(t.form.favoriteYes)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) })).toBeChecked();
  });

  it('keeps dirty favorite and dumped drafts when incoming server props also changed', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByDisplayValue(t.common.no), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) }));
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) }));
    await act(async () => {
      rerender(<EditForm vn={makeVn({ favorite: true, dumped: true, dumped_ignored: true })} inCollection allSeries={allSeries} />);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByDisplayValue(t.form.favoriteYes)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumped) })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: new RegExp(t.form.dumpedIgnored) })).toBeChecked();
  });
});

describe('EditForm not-in-collection add success (real timers)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        return Promise.resolve().then(() => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('adds the VN to the collection and shows the success toast', async () => {
    renderWithProviders(<EditForm vn={makeVn()} inCollection={false} allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.form.add }));
    await waitFor(() => expect(screen.getAllByText(t.toast.added).length).toBeGreaterThan(0), { timeout: 5000 });
    expect(refreshMock).toHaveBeenCalled();
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

  it('uses an empty places list when the places response shape is invalid', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(t.form.myTracking)).toBeInTheDocument();
  });

  it('ignores an AbortError from the places request', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('uses default collection-field values when the collection payload is sparse', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    renderWithProviders(<EditForm vn={makeSparseCollectionVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByDisplayValue(t.status.planning)).toBeInTheDocument();
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
    expect(screen.getByDisplayValue(t.common.no)).toBeInTheDocument();
  });

  it('uses an empty series list when the collection payload omits series', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(placesResponse()));
    const vn = makeVn();
    delete vn.series;
    renderWithProviders(<EditForm vn={vn} inCollection allSeries={allSeries} />, { locale: 'en' });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('combobox', { name: t.detail.addToSeries })).toBeInTheDocument();
  });

  it('ignores a places response that resolves after unmount', async () => {
    let resolvePlaces: (response: Response) => void = () => {};
    global.fetch = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolvePlaces = resolve;
      }),
    ) as unknown as typeof fetch;
    const { unmount } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    unmount();
    await act(async () => {
      resolvePlaces(placesResponse());
      await Promise.resolve();
    });
    expect(screen.queryByText(t.form.myTracking)).toBeNull();
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

describe('EditForm collection and series action success (real timers)', () => {
  beforeEach(() => {
    vi.useRealTimers();
    pushMock.mockReset();
    refreshMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears a pending autosave and removes the VN after confirmation', async () => {
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      if (String(url) === '/api/collection/v90001' && init?.method === 'DELETE') {
        return Promise.resolve(okResponse());
      }
      if (String(url) === '/api/collection/v90001' && init?.method === 'PATCH') {
        return Promise.resolve(okResponse());
      }
      return Promise.resolve(placesResponse());
    });
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await screen.findByText(t.form.myTracking);
    fireEvent.change(screen.getByDisplayValue(t.status.playing), { target: { value: 'completed' } });
    fireEvent.click(screen.getByRole('button', { name: t.form.remove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/collection/v90001' && call[1]?.method === 'DELETE')).toBe(true);
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/collection/v90001' && call[1]?.method === 'PATCH')).toBe(false);
  });

  it('cancels collection removal without calling DELETE', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await screen.findByText(t.form.myTracking);
    fireEvent.click(screen.getByRole('button', { name: t.form.remove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
  });

  it('does not remove when confirmation resolves after the VN identity changed', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(placesResponse()));
    global.fetch = fetchMock;
    const { rerender } = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await screen.findByText(t.form.myTracking);
    fireEvent.click(screen.getByRole('button', { name: t.form.remove }));
    const dialog = await screen.findByRole('alertdialog');
    rerender(<EditForm vn={makeVn({ id: 'v90002', title: 'Other VN' })} inCollection allSeries={allSeries} />);
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);
    expect(pushMock).not.toHaveBeenCalledWith('/');
  });

  it('adds and removes series links successfully', async () => {
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      if (String(url).includes('/api/series/') && (init?.method === 'POST' || init?.method === 'DELETE')) {
        return Promise.resolve(okResponse());
      }
      return Promise.resolve(placesResponse());
    });
    global.fetch = fetchMock;
    const first = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    const select = await screen.findByRole('combobox', { name: t.detail.addToSeries });
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.detail.addToSeries }));
    await waitFor(() => expect(screen.getAllByText(t.seriesAutoSuggest.added).length).toBeGreaterThan(0));
    expect(refreshMock).toHaveBeenCalled();
    first.unmount();

    refreshMock.mockClear();
    renderWithProviders(<EditForm vn={makeVn({ series: [{ id: 1, name: 'Series One' }] })} inCollection allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(screen.getAllByText(t.toast.removedFromSeries).length).toBeGreaterThan(0));
    expect(refreshMock).toHaveBeenCalled();
  });

  it('ignores stale add completions and failures after unmount', async () => {
    const addResponse = deferredResponse();
    let addStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'POST') {
        addStarted += 1;
        return addResponse.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const successView = renderWithProviders(<EditForm vn={makeVn()} inCollection={false} allSeries={allSeries} />, { locale: 'en' });
    const addButton = screen.getByRole('button', { name: t.form.add });
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    await waitFor(() => expect(addStarted).toBe(1));
    successView.unmount();
    await act(async () => {
      addResponse.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(t.toast.added)).toBeNull();

    const addFailure = deferredResponse();
    let failureStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'POST') {
        failureStarted += 1;
        return addFailure.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const failureView = renderWithProviders(<EditForm vn={makeVn()} inCollection={false} allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.form.add }));
    await waitFor(() => expect(failureStarted).toBe(1));
    failureView.unmount();
    await act(async () => {
      addFailure.reject(new Error('late add failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late add failed')).toBeNull();
  });

  it('ignores stale remove completions and failures after unmount', async () => {
    const removeResponse = deferredResponse();
    let removeStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'DELETE') {
        removeStarted += 1;
        return removeResponse.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const successView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await screen.findByText(t.form.myTracking);
    const removeButton = screen.getByRole('button', { name: t.form.remove });
    fireEvent.click(removeButton);
    fireEvent.click(removeButton);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(removeStarted).toBe(1));
    successView.unmount();
    await act(async () => {
      removeResponse.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pushMock).not.toHaveBeenCalledWith('/');

    const removeFailure = deferredResponse();
    let failureStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url) === '/api/collection/v90001' && init.method === 'DELETE') {
        failureStarted += 1;
        return removeFailure.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const failureView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    await screen.findByText(t.form.myTracking);
    fireEvent.click(screen.getByRole('button', { name: t.form.remove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(failureStarted).toBe(1));
    failureView.unmount();
    await act(async () => {
      removeFailure.reject(new Error('late remove failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late remove failed')).toBeNull();
  });

  it('ignores stale series mutation completions and failures after unmount', async () => {
    const addResponse = deferredResponse();
    let addStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'POST') {
        addStarted += 1;
        return addResponse.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const addView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    const select = await screen.findByRole('combobox', { name: t.detail.addToSeries });
    fireEvent.change(select, { target: { value: '2' } });
    const addSeriesButton = screen.getByRole('button', { name: t.detail.addToSeries });
    fireEvent.click(addSeriesButton);
    fireEvent.click(addSeriesButton);
    await waitFor(() => expect(addStarted).toBe(1));
    addView.unmount();
    await act(async () => {
      addResponse.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(t.seriesAutoSuggest.added)).toBeNull();

    const addFailure = deferredResponse();
    let addFailureStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'POST') {
        addFailureStarted += 1;
        return addFailure.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const addFailureView = renderWithProviders(<EditForm vn={makeVn()} inCollection allSeries={allSeries} />, { locale: 'en' });
    fireEvent.change(await screen.findByRole('combobox', { name: t.detail.addToSeries }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.detail.addToSeries }));
    await waitFor(() => expect(addFailureStarted).toBe(1));
    addFailureView.unmount();
    await act(async () => {
      addFailure.reject(new Error('late series add failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late series add failed')).toBeNull();

    const removeResponse = deferredResponse();
    let removeStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'DELETE') {
        removeStarted += 1;
        return removeResponse.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const removeView = renderWithProviders(<EditForm vn={makeVn({ series: [{ id: 1, name: 'Series One' }] })} inCollection allSeries={allSeries} />, { locale: 'en' });
    const removeSeriesButton = await screen.findByRole('button', { name: t.series.removeFromSeries });
    fireEvent.click(removeSeriesButton);
    fireEvent.click(removeSeriesButton);
    await waitFor(() => expect(removeStarted).toBe(1));
    removeView.unmount();
    await act(async () => {
      removeResponse.resolve(okResponse());
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(t.toast.removedFromSeries)).toBeNull();

    const removeFailure = deferredResponse();
    let removeFailureStarted = 0;
    global.fetch = vi.fn((url: string, init: RequestInit = {}) => {
      if (String(url).includes('/api/series/') && init.method === 'DELETE') {
        removeFailureStarted += 1;
        return removeFailure.promise;
      }
      return Promise.resolve(placesResponse());
    }) as unknown as typeof fetch;
    const removeFailureView = renderWithProviders(<EditForm vn={makeVn({ series: [{ id: 1, name: 'Series One' }] })} inCollection allSeries={allSeries} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(removeFailureStarted).toBe(1));
    removeFailureView.unmount();
    await act(async () => {
      removeFailure.reject(new Error('late series remove failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late series remove failed')).toBeNull();
  });
});
