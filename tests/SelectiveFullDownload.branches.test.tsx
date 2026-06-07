// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SelectiveFullDownload } from '@/components/SelectiveFullDownload';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

interface RowSeed {
  id: string;
  title: string;
  released?: string | null;
  status?: string | null;
  updated_at?: number | null;
  user_rating?: number | null;
  playtime_minutes?: number | null;
}

function row(seed: RowSeed) {
  return {
    id: seed.id,
    title: seed.title,
    alttitle: null,
    released: seed.released ?? null,
    status: seed.status ?? null,
    rating: null,
    user_rating: seed.user_rating ?? null,
    playtime_minutes: seed.playtime_minutes ?? null,
    added_at: null,
    updated_at: seed.updated_at ?? null,
  };
}

function collectionPage(items: ReturnType<typeof row>[]) {
  return json({ items, pagination: { page: 1, page_size: 500, returned: items.length, has_more: false } });
}

function titles() {
  return [...document.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error | string) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SelectiveFullDownload sort branches', () => {
  it('sorts by status with null statuses pinned last', async () => {
    const rows = [
      row({ id: 'v90001', title: 'No Status', status: null }),
      row({ id: 'v90002', title: 'Playing', status: 'playing' }),
      row({ id: 'v90003', title: 'Completed', status: 'completed' }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('No Status');
    await user.selectOptions(screen.getByLabelText('Sort'), 'status');
    // status defaults to ascending; the two real statuses keep their relative
    // order (completed before playing) under the string comparator.
    const order = titles();
    expect(order.indexOf('Completed')).toBeLessThan(order.indexOf('Playing'));
    // Flip to descending and the relative order reverses.
    await user.click(screen.getByRole('button', { name: 'Ascending' }));
    const desc = titles();
    expect(desc.indexOf('Playing')).toBeLessThan(desc.indexOf('Completed'));
  });

  it('sorts by updated_at, ordering the two timestamped rows newest-first', async () => {
    const rows = [
      row({ id: 'v90001', title: 'Older', updated_at: 100 }),
      row({ id: 'v90002', title: 'Newer', updated_at: 300 }),
      row({ id: 'v90003', title: 'Never', updated_at: null }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Older');
    await user.selectOptions(screen.getByLabelText('Sort'), 'updated_at');
    // updated_at defaults to descending: among the dated rows, Newer precedes Older.
    const order = titles();
    expect(order.indexOf('Newer')).toBeLessThan(order.indexOf('Older'));
    // The null-timestamp row is present.
    expect(order).toContain('Never');
  });

  it('sorts by user_rating then by playtime descending', async () => {
    const rows = [
      row({ id: 'v90001', title: 'LowRate', user_rating: 40, playtime_minutes: 600 }),
      row({ id: 'v90002', title: 'HighRate', user_rating: 95, playtime_minutes: 60 }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('LowRate');
    await user.selectOptions(screen.getByLabelText('Sort'), 'user_rating');
    expect(titles()).toEqual(['HighRate', 'LowRate']);
    await user.selectOptions(screen.getByLabelText('Sort'), 'playtime');
    // playtime desc: 600 before 60.
    expect(titles()).toEqual(['LowRate', 'HighRate']);
  });

  it('re-loads the collection when defaultFilters change identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]));
    global.fetch = fetchMock;
    const { rerender } = renderWithProviders(
      <SelectiveFullDownload defaultFilters={{ status: 'playing' }} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    const firstCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/collection')).length;
    // A new filtersKey re-runs the load callback.
    rerender(<SelectiveFullDownload defaultFilters={{ status: 'completed' }} />);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('status=completed'));
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/collection')).length).toBeGreaterThan(firstCalls);
  });

  it('does not forward empty default filter values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]));
    global.fetch = fetchMock;
    renderWithProviders(
      <SelectiveFullDownload defaultFilters={{ status: '', tag: 'g90' }} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain('status=');
    expect(url).toContain('tag=g90');
  });

  it('ignores a successful stale load after filters change', async () => {
    const stale = deferredResponse();
    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) return stale.promise;
      return Promise.resolve(collectionPage([row({ id: 'v90002', title: 'Fresh Filtered' })]));
    });
    const { rerender } = renderWithProviders(
      <SelectiveFullDownload defaultFilters={{ status: 'playing' }} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    rerender(<SelectiveFullDownload defaultFilters={{ status: 'completed' }} />);
    expect(await screen.findByText('Fresh Filtered')).toBeTruthy();
    await act(async () => {
      stale.resolve(collectionPage([row({ id: 'v90001', title: 'Stale Filtered' })]));
    });
    expect(screen.queryByText('Stale Filtered')).toBeNull();
  });

  it('ignores abort errors during load', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abortError);
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
    expect(screen.queryByText('aborted')).toBeNull();
  });

  it('uses the generic load error for non-Error rejections', async () => {
    global.fetch = vi.fn().mockRejectedValue('plain load');
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    expect(await screen.findByText('Error')).toBeTruthy();
  });

  it('sorts numeric rows with both compared values null by title', async () => {
    const rows = [
      row({ id: 'v90001', title: 'Beta', user_rating: null }),
      row({ id: 'v90002', title: 'Alpha', user_rating: null }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Beta');
    await user.selectOptions(screen.getByLabelText('Sort'), 'user_rating');
    await user.click(screen.getByRole('button', { name: 'Descending' }));
    expect(titles()).toEqual(['Alpha', 'Beta']);
  });

  it('sorts released rows with null dates participating in the string fallback', async () => {
    const rows = [
      row({ id: 'v90001', title: 'No Date', released: null }),
      row({ id: 'v90002', title: 'Dated', released: '2024-01-01' }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('No Date');
    await user.selectOptions(screen.getByLabelText('Sort'), 'released');
    const order = titles();
    expect(order).toContain('No Date');
    expect(order).toContain('Dated');
  });

  it('toggles the same selected sort key from descending back to ascending', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage([
      row({ id: 'v90001', title: 'Alpha' }),
      row({ id: 'v90002', title: 'Beta' }),
    ]));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Alpha');
    await user.selectOptions(screen.getByLabelText('Sort'), 'title');
    expect(titles()).toEqual(['Beta', 'Alpha']);
    await user.selectOptions(screen.getByLabelText('Sort'), 'title');
    expect(titles()).toEqual(['Alpha', 'Beta']);
  });

  it('does not start a second submit while one is pending', async () => {
    const pendingSubmit = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]))
      .mockReturnValueOnce(pendingSubmit.promise);
    global.fetch = fetchMock;
    renderWithProviders(<SelectiveFullDownload defaultSelected={new Set(['v90001'])} />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    const run = screen.getByRole('button', { name: 'Run (1)' });
    act(() => {
      run.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      run.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/collection/full-download')).toHaveLength(1));
    await act(async () => {
      pendingSubmit.resolve(json({ queued: 1 }));
    });
  });

  it('toasts the generic error when submit returns an invalid queued body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]))
      .mockResolvedValueOnce(json({ nope: true }));
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<SelectiveFullDownload defaultSelected={new Set(['v90001'])} />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (1)' }));
    expect(await screen.findByText('Error')).toBeTruthy();
  });

  it('ignores a successful submit after unmount', async () => {
    const pendingSubmit = deferredResponse();
    const onSubmitDone = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]))
      .mockReturnValueOnce(pendingSubmit.promise);
    global.fetch = fetchMock;
    const { user, unmount } = renderWithProviders(
      <SelectiveFullDownload defaultSelected={new Set(['v90001'])} onSubmitDone={onSubmitDone} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (1)' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/collection/full-download')).toHaveLength(1));
    unmount();
    await act(async () => {
      pendingSubmit.resolve(json({ queued: 1 }));
    });
    expect(onSubmitDone).not.toHaveBeenCalled();
  });

  it('ignores submit AbortError failures', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]))
      .mockRejectedValueOnce(abortError);
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<SelectiveFullDownload defaultSelected={new Set(['v90001'])} />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (1)' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/collection/full-download')).toHaveLength(1));
    expect(screen.queryByText('aborted')).toBeNull();
  });

  it('uses the generic submit error for non-Error rejections', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]))
      .mockRejectedValueOnce('plain submit');
    global.fetch = fetchMock;
    const { user } = renderWithProviders(<SelectiveFullDownload defaultSelected={new Set(['v90001'])} />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (1)' }));
    expect(await screen.findByText('Error')).toBeTruthy();
  });
});
