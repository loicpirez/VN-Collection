// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockBatchClient } from '@/components/StockBatchClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/** Flush pending fake timers + microtasks inside React's act() boundary. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface RouteOpts {
  settings?: unknown;
  queue?: (scope: string, page: number) => unknown;
  batchStart?: unknown;
  batchStartStatus?: number;
  downloadStatus?: () => unknown;
  libraryFind?: unknown;
  onBatchDelete?: () => void;
}

/** Build a fetch mock that dispatches by URL + method. */
function routedFetch(opts: RouteOpts = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith('/api/settings')) {
      return Promise.resolve(json(opts.settings ?? {}));
    }
    if (url.startsWith('/api/stock/queue')) {
      const parsed = new URL(url, 'http://localhost');
      const scope = parsed.searchParams.get('scope') ?? '';
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const payload = opts.queue ? opts.queue(scope, page) : { entries: [], next_page: null };
      return Promise.resolve(json(payload));
    }
    if (url.startsWith('/api/stock/batch') && method === 'POST') {
      return Promise.resolve(json(opts.batchStart ?? { jobId: 'job-1', queued: 3 }, opts.batchStartStatus ?? 200));
    }
    if (url.startsWith('/api/stock/batch') && method === 'DELETE') {
      opts.onBatchDelete?.();
      return Promise.resolve(json({ ok: true }));
    }
    if (url.startsWith('/api/download-status')) {
      const payload = opts.downloadStatus
        ? opts.downloadStatus()
        : { throttle: { active: 0, queued: 0 }, jobs: [] };
      return Promise.resolve(json(payload));
    }
    if (url.startsWith('/api/collection/find')) {
      return Promise.resolve(json(opts.libraryFind ?? { matches: [] }));
    }
    if (url.startsWith('/api/search')) {
      return Promise.resolve(json({ results: [] }));
    }
    if (url.startsWith('/api/egs/search')) {
      return Promise.resolve(json({ candidates: [] }));
    }
    return Promise.resolve(json({}));
  });
}

const RUNNING_JOB = {
  id: 'job-1',
  kind: 'stock-batch',
  vn_id: null,
  label: 'Stock refresh x 3',
  total: 3,
  done: 1,
  errors: [],
  started_at: 1,
  finished_at: null,
};

describe('StockBatchClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = routedFetch();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the heading, every provider toggle, and the run button', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    expect(screen.getByText('Batch stock refresh')).not.toBeNull();
    // A few representative provider chips (brand labels are static).
    expect(screen.getByRole('button', { name: 'Eroge Price' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Getchu' })).not.toBeNull();
    // Run is disabled with an empty queue.
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(true);
  });

  it('drops providers disabled in settings on mount', async () => {
    global.fetch = routedFetch({ settings: { stock_disabled_providers: ['getchu'] } });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    // Getchu chip is deselected: its className lacks the active accent border.
    const getchu = screen.getByRole('button', { name: 'Getchu' });
    expect(getchu.className).not.toContain('bg-accent/20');
    const eroge = screen.getByRole('button', { name: 'Eroge Price' });
    expect(eroge.className).toContain('bg-accent/20');
  });

  it('toggles a single provider off and back on', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    const eroge = screen.getByRole('button', { name: 'Eroge Price' });
    expect(eroge.className).toContain('bg-accent/20');
    fireEvent.click(eroge);
    expect(eroge.className).not.toContain('bg-accent/20');
    fireEvent.click(eroge);
    expect(eroge.className).toContain('bg-accent/20');
  });

  it('clears all providers via None and disables the run button', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).not.toContain('bg-accent/20');
    // No providers selected -> run stays disabled even with a future queue.
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(true);
  });

  it('restricts the selection to the aggregator group', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Aggregator' }));
    // eroge_price + getchu are the aggregator group members.
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Sofmap / Recole' }).className).not.toContain('bg-accent/20');
  });

  it('restricts the selection to the physical and online groups', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Physical' }));
    // Sofmap is a physical-store provider; Eroge Price (aggregator) is not.
    expect(screen.getByRole('button', { name: 'Sofmap / Recole' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).not.toContain('bg-accent/20');
    fireEvent.click(screen.getByRole('button', { name: 'Online' }));
    // AmiAmi is an online provider; Sofmap (physical) is not.
    expect(screen.getByRole('button', { name: 'AmiAmi' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Sofmap / Recole' }).className).not.toContain('bg-accent/20');
    // Re-selecting All restores every provider.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).toContain('bg-accent/20');
  });

  it('loads a scope into the queue and renders the queue rows', async () => {
    global.fetch = routedFetch({
      queue: (scope, page) =>
        scope === 'collection' && page === 1
          ? { entries: [{ vn_id: 'v90001', title: 'Title One' }, { vn_id: 'v90002', title: 'Title Two' }], next_page: null }
          : { entries: [], next_page: null },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Title One')).not.toBeNull();
    expect(screen.getByText('Title Two')).not.toBeNull();
    expect(screen.getByText('Queue (2)')).not.toBeNull();
  });

  it('removes a single queued VN and clears the whole queue', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }, { vn_id: 'v90002', title: 'Title Two' }], next_page: null }),
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    const oneRow = screen.getByText('Title One').closest('li') as HTMLElement;
    fireEvent.click(within(oneRow).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Title One')).toBeNull();
    expect(screen.getByText('Queue (1)')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Title Two')).toBeNull();
    expect(screen.queryByText(/Queue \(/)).toBeNull();
  });

  it('paginates the queue when it exceeds the page size', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      vn_id: `v${90000 + i}`,
      title: `Title ${i}`,
    }));
    global.fetch = routedFetch({ queue: () => ({ entries, next_page: null }) });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Queue (60)')).not.toBeNull();
    // Page 1 shows the first 50; row 55 lives on page 2.
    expect(screen.getByText('Title 0')).not.toBeNull();
    expect(screen.queryByText('Title 55')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Title 55')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Title 0')).not.toBeNull();
  });

  it('surfaces an error when a scope load fails', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ error: 'queue boom' }, 500));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('queue boom')).not.toBeNull();
  });

  it('adds a VN from the library search and queues it', async () => {
    global.fetch = routedFetch({
      libraryFind: {
        matches: [
          { id: 'v90050', title: 'Searched Title', image_url: null, image_thumb: null, local_image: null, local_image_thumb: null },
        ],
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    const searchInput = screen.getByLabelText('Search a VN');
    fireEvent.change(searchInput, { target: { value: 'Searched' } });
    // VnSourcePicker debounces 250ms then fetches the three sources.
    await flush(300);
    fireEvent.click(screen.getByText('Searched Title'));
    expect(screen.getByText('Queue (1)')).not.toBeNull();
  });

  it('starts a batch job, shows the started banner and the stop button, then polls to completion', async () => {
    let jobFinished = false;
    const deleteSpy = vi.fn();
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }),
      batchStart: { jobId: 'job-1', queued: 1 },
      downloadStatus: () => ({
        throttle: { active: 0, queued: 0 },
        jobs: jobFinished ? [{ ...RUNNING_JOB, finished_at: 99 }] : [RUNNING_JOB],
      }),
      onBatchDelete: deleteSpy,
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    // Started banner reflects the queued count.
    expect(screen.getByText('1 VNs refreshing in the background.')).not.toBeNull();
    const stopBtn = screen.getByRole('button', { name: 'Stop' });
    expect(stopBtn).not.toBeNull();

    // Drive the 2s poll; the job is still live so the banner stays.
    await flush(2_000);
    expect(screen.getByText('1 VNs refreshing in the background.')).not.toBeNull();

    // Job finishes -> next poll clears the jobId and the banner.
    jobFinished = true;
    await flush(2_000);
    expect(screen.queryByText('1 VNs refreshing in the background.')).toBeNull();
  });

  it('stops a running job via the stop button (DELETE)', async () => {
    const deleteSpy = vi.fn();
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }),
      batchStart: { jobId: 'job-1', queued: 1 },
      downloadStatus: () => ({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }),
      onBatchDelete: deleteSpy,
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('shows an error when the batch start response is not ok', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }),
      batchStart: { error: 'batch refused' },
      batchStartStatus: 500,
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByText('batch refused')).not.toBeNull();
  });

  it('de-duplicates VN ids shared across the two scopes when merging', async () => {
    global.fetch = routedFetch({
      queue: (scope) =>
        scope === 'collection'
          ? { entries: [{ vn_id: 'v90001', title: 'Shared One' }, { vn_id: 'v90002', title: 'Coll Only' }], next_page: null }
          : { entries: [{ vn_id: 'v90001', title: 'Shared One' }, { vn_id: 'v90003', title: 'Wish Only' }], next_page: null },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection + wishlist' }));
    await flush();
    // v90001 appears in both scopes but is merged once -> 3 unique entries.
    expect(screen.getByText('Queue (3)')).not.toBeNull();
    expect(screen.getAllByText('Shared One')).toHaveLength(1);
  });

  it('does not re-add a VN already in the queue when picked again from search', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90050', title: 'Searched Title' }], next_page: null }),
      libraryFind: {
        matches: [
          { id: 'v90050', title: 'Searched Title', image_url: null, image_thumb: null, local_image: null, local_image_thumb: null },
        ],
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    // Seed the queue from the collection scope first.
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Queue (1)')).not.toBeNull();
    // Search for the same VN and pick it again -> queue stays at 1 (dedup).
    fireEvent.change(screen.getByLabelText('Search a VN'), { target: { value: 'Searched' } });
    await flush(300);
    fireEvent.click(screen.getAllByText('Searched Title')[0]);
    expect(screen.getByText('Queue (1)')).not.toBeNull();
  });

  it('keeps pagination controls clamped at the first and last page boundaries', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ vn_id: `v${90000 + i}`, title: `Title ${i}` }));
    global.fetch = routedFetch({ queue: () => ({ entries, next_page: null }) });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    // On page 1, Previous is disabled; clicking it is a no-op clamp.
    expect(prev.hasAttribute('disabled')).toBe(true);
    fireEvent.click(prev);
    expect(screen.getByText('Title 0')).not.toBeNull();
    // Move to the last page; Next becomes disabled and clamps.
    fireEvent.click(next);
    expect(next.hasAttribute('disabled')).toBe(true);
    fireEvent.click(next);
    expect(screen.getByText('Title 55')).not.toBeNull();
  });

  it('loads both scopes through the "Whole collection + wishlist" shortcut', async () => {
    const scopesSeen: string[] = [];
    global.fetch = routedFetch({
      queue: (scope) => {
        scopesSeen.push(scope);
        return scope === 'collection'
          ? { entries: [{ vn_id: 'v90001', title: 'Coll One' }], next_page: null }
          : { entries: [{ vn_id: 'v90002', title: 'Wish One' }], next_page: null };
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection + wishlist' }));
    await flush();
    expect(scopesSeen).toContain('collection');
    expect(scopesSeen).toContain('wishlist');
    expect(screen.getByText('Coll One')).not.toBeNull();
    expect(screen.getByText('Wish One')).not.toBeNull();
  });
});
