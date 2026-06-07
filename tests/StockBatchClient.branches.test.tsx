// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockBatchClient, mergeStockBatchQueue } from '@/components/StockBatchClient';

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

interface RouteOpts {
  settings?: unknown;
  queue?: (scope: string, page: number) => unknown;
  batchStart?: unknown;
  downloadStatus?: () => unknown;
  onBatchDelete?: () => Response | void;
}

function routedFetch(opts: RouteOpts = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/settings')) return Promise.resolve(json(opts.settings ?? {}));
    if (url.startsWith('/api/stock/queue')) {
      const parsed = new URL(url, 'http://localhost');
      const scope = parsed.searchParams.get('scope') ?? '';
      const page = Number(parsed.searchParams.get('page') ?? '1');
      const payload = opts.queue ? opts.queue(scope, page) : { entries: [], next_page: null };
      return Promise.resolve(json(payload));
    }
    if (url.startsWith('/api/stock/batch') && method === 'POST') return Promise.resolve(json(opts.batchStart ?? { jobId: 'job-1', queued: 3 }));
    if (url.startsWith('/api/stock/batch') && method === 'DELETE') {
      const res = opts.onBatchDelete?.();
      return Promise.resolve(res ?? json({ ok: true }));
    }
    if (url.startsWith('/api/download-status')) {
      return Promise.resolve(json(opts.downloadStatus ? opts.downloadStatus() : { throttle: { active: 0, queued: 0 }, jobs: [] }));
    }
    if (url.startsWith('/api/collection/find')) return Promise.resolve(json({ matches: [] }));
    if (url.startsWith('/api/search')) return Promise.resolve(json({ results: [] }));
    if (url.startsWith('/api/egs/search')) return Promise.resolve(json({ candidates: [] }));
    return Promise.resolve(json({}));
  });
}

const RUNNING_JOB = {
  id: 'job-1', kind: 'stock-batch', vn_id: null, label: 'Stock refresh x 3',
  total: 3, done: 1, errors: [], started_at: 1, finished_at: null,
};

describe('StockBatchClient branches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = routedFetch();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paginates a multi-page scope load into one queue', async () => {
    global.fetch = routedFetch({
      queue: (scope, page) =>
        scope === 'collection'
          ? page === 1
            ? { entries: [{ vn_id: 'v90001', title: 'Page1 A' }], next_page: 2 }
            : { entries: [{ vn_id: 'v90002', title: 'Page2 B' }], next_page: null }
          : { entries: [], next_page: null },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Page1 A')).not.toBeNull();
    expect(screen.getByText('Page2 B')).not.toBeNull();
    expect(screen.getByText('Queue (2)')).not.toBeNull();
  });

  it('loads the reading-queue and stale (recent_stock) scopes', async () => {
    const scopes: string[] = [];
    global.fetch = routedFetch({
      queue: (scope) => {
        scopes.push(scope);
        return scope === 'reading_queue'
          ? { entries: [{ vn_id: 'v90010', title: 'Queue VN' }], next_page: null }
          : { entries: [{ vn_id: 'v90011', title: 'Stale VN' }], next_page: null };
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Reading queue' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Oldest stock data' }));
    await flush();
    expect(scopes).toContain('reading_queue');
    expect(scopes).toContain('recent_stock');
    expect(screen.getByText('Queue VN')).not.toBeNull();
    expect(screen.getByText('Stale VN')).not.toBeNull();
  });

  it('renders a queued row without a title by falling back to the VN id', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90077', title: null }], next_page: null }),
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getAllByText('v90077').length).toBeGreaterThan(0);
  });

  it('surfaces an error when the stop DELETE fails', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }),
      batchStart: { jobId: 'job-1', queued: 1 },
      downloadStatus: () => ({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }),
      onBatchDelete: () => json({ error: 'stop boom' }, 500),
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(screen.getByText('stop boom')).not.toBeNull();
  });

  it('ignores an empty disabled-providers setting (all providers stay selected)', async () => {
    global.fetch = routedFetch({ settings: { stock_disabled_providers: [] } });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    // Empty disabled set -> the early return keeps the default full selection.
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).toContain('bg-accent/20');
  });

  it('keeps defaults when the settings request rejects', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.reject(new Error('settings down'));
      return Promise.resolve(json({ entries: [], next_page: null }));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
    expect(screen.getByRole('button', { name: 'Eroge Price' }).className).toContain('bg-accent/20');
  });

  it('keeps defaults when settings payload is invalid or the request resolves after unmount', async () => {
    global.fetch = routedFetch({ settings: { stock_disabled_providers: 'bad' } });
    const invalid = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
    invalid.unmount();

    const settings = deferred<Response>();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return settings.promise;
      return Promise.resolve(json({}));
    });
    const stale = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    stale.unmount();
    settings.resolve(json({ stock_disabled_providers: ['getchu'] }));
    await flush();
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
  });

  it('keeps defaults when the settings response is not ok', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({ error: 'nope' }, 500));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    expect(screen.getByRole('button', { name: 'Getchu' }).className).toContain('bg-accent/20');
  });

  it('deduplicates and caps queue merges without rendering thousands of rows', () => {
    const result = mergeStockBatchQueue(
      [{ vnId: 'v91000', title: 'Existing' }],
      [
        { vnId: 'v91000', title: 'Duplicate' },
        { vnId: 'v91001', title: 'New one' },
        { vnId: 'v91002', title: 'Over cap' },
      ],
      2,
    );
    expect(result).toEqual({
      entries: [
        { vnId: 'v91000', title: 'Existing' },
        { vnId: 'v91001', title: 'New one' },
      ],
      capped: true,
    });
  });

  it('shows the capacity warning when a loaded scope exceeds the queue cap', async () => {
    global.fetch = routedFetch({
      queue: (_scope, page) => ({
        entries: Array.from({ length: 500 }, (_, i) => {
          const index = (page - 1) * 500 + i;
          return { vn_id: `v${100000 + index}`, title: `Cap ${index}` };
        }),
        next_page: page < 11 ? page + 1 : null,
      }),
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Queue (5000)')).not.toBeNull();
    expect(screen.getByText('The queue is limited to 5000 VNs. Run this queue before adding more.')).not.toBeNull();
  });

  it('keeps the banner when a poll fails (network blip) without clearing the job', async () => {
    let pollCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return Promise.resolve(json({ jobId: 'job-1', queued: 1 }));
      if (url.startsWith('/api/download-status')) {
        pollCount++;
        // First poll fails; the job banner must persist.
        if (pollCount === 1) return Promise.resolve(json({ error: 'poll boom' }, 500));
        return Promise.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }));
      }
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    // First poll fails -> banner stays. Advance to the retry poll.
    await flush(2_000);
    expect(screen.getByText('1 VNs refreshing in the background.')).not.toBeNull();
  });

  it('keeps the banner when a poll payload is malformed and ignores stale poll completions after unmount', async () => {
    const poll = deferred<Response>();
    let pollCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return Promise.resolve(json({ jobId: 'job-1', queued: 1 }));
      if (url.startsWith('/api/download-status')) {
        pollCount++;
        if (pollCount === 1) return Promise.resolve(json({ not_jobs: [] }));
        return poll.promise;
      }
      return Promise.resolve(json({}));
    });
    const view = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    await flush(2_000);
    expect(screen.getByText('1 VNs refreshing in the background.')).not.toBeNull();
    view.unmount();
    poll.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }));
    await flush();
  });

  it('ignores abort-like polling failures', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return Promise.resolve(json({ jobId: 'job-1', queued: 1 }));
      if (url.startsWith('/api/download-status')) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(screen.getByText('1 VNs refreshing in the background.')).not.toBeNull();
  });

  it('blocks duplicate scope loads and aborts active scope requests on clear and unmount', async () => {
    const queue = deferred<Response>();
    const signals: AbortSignal[] = [];
    let queueCalls = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) {
        queueCalls++;
        if (init?.signal) signals.push(init.signal);
        return queue.promise;
      }
      return Promise.resolve(json({}));
    });
    const view = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    const collection = screen.getByRole('button', { name: 'Whole collection' });
    act(() => {
      fireEvent.click(collection);
      fireEvent.click(collection);
      fireEvent.click(screen.getByRole('button', { name: 'Whole collection + wishlist' }));
    });
    expect(queueCalls).toBe(1);
    view.unmount();
    expect(signals[0]!.aborted).toBe(true);
    queue.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Late Scope' }], next_page: null }));
    await flush();
  });

  it('aborts active scope requests when clearing an existing queue', async () => {
    const pending = deferred<Response>();
    const signals: AbortSignal[] = [];
    let firstQueue = true;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) {
        if (firstQueue) {
          firstQueue = false;
          return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
        }
        if (init?.signal) signals.push(init.signal);
        return pending.promise;
      }
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Queue (1)')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'VNDB Wishlist' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(signals[0]!.aborted).toBe(true);
  });

  it('reports malformed scope payloads and ignores abort-like scope failures', async () => {
    global.fetch = routedFetch({ queue: () => ({ bad: true }) });
    const malformed = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
    malformed.unmount();

    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.queryByText('aborted')).toBeNull();
  });

  it('uses the generic fallback for non-Error scope failures', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.reject('plain failure');
      return Promise.resolve(json({}));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
  });

  it('keeps the queue when clear is clicked during an in-flight start', async () => {
    const start = deferred<Response>();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return start.promise;
      return Promise.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });
    expect(screen.getByText('Queue (1)')).not.toBeNull();
    start.resolve(json({ jobId: 'job-1', queued: 1 }));
    await flush();
  });

  it('reports invalid and non-Error batch start responses and ignores abort-like start failures', async () => {
    const cases: Array<{ response?: Response; rejection?: unknown; expected?: string }> = [
      { response: json({ job: 'bad' }), expected: 'Error' },
      { rejection: 'plain start failure', expected: 'Error' },
      { rejection: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
    ];
    for (const testCase of cases) {
      global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method ?? 'GET').toUpperCase();
        if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
        if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
        if (url.startsWith('/api/stock/batch') && method === 'POST') {
          if ('rejection' in testCase) return Promise.reject(testCase.rejection);
          return Promise.resolve(testCase.response!);
        }
        return Promise.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
      });
      const view = renderWithProviders(<StockBatchClient />, { locale: 'en' });
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
      await flush();
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await flush();
      if (testCase.expected) expect(screen.getAllByText(testCase.expected).length).toBeGreaterThan(0);
      view.unmount();
    }
  });

  it('ignores a late batch start response after unmount', async () => {
    const start = deferred<Response>();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return start.promise;
      return Promise.resolve(json({}));
    });
    const view = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    view.unmount();
    await act(async () => {
      start.resolve(json({ jobId: 'job-1', queued: 1 }));
      await Promise.resolve();
    });
  });

  it('blocks duplicate stop requests and ignores stale or abort-like stop completions', async () => {
    const stopResponse = deferred<Response>();
    let deleteCalls = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) return Promise.resolve(json({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }));
      if (url.startsWith('/api/stock/batch') && method === 'POST') return Promise.resolve(json({ jobId: 'job-1', queued: 1 }));
      if (url.startsWith('/api/stock/batch') && method === 'DELETE') {
        deleteCalls++;
        return stopResponse.promise;
      }
      if (url.startsWith('/api/download-status')) return Promise.resolve(json({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }));
      return Promise.resolve(json({}));
    });
    const view = renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(deleteCalls).toBe(1);
    view.unmount();
    await act(async () => {
      stopResponse.resolve(json({ ok: true }));
      await Promise.resolve();
    });

    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90002', title: 'Title Two' }], next_page: null }),
      batchStart: { jobId: 'job-1', queued: 1 },
      downloadStatus: () => ({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }),
      onBatchDelete: () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(screen.queryByText('aborted')).toBeNull();
  });

  it('uses the generic fallback for non-Error stop failures', async () => {
    global.fetch = routedFetch({
      queue: () => ({ entries: [{ vn_id: 'v90001', title: 'Title One' }], next_page: null }),
      batchStart: { jobId: 'job-1', queued: 1 },
      downloadStatus: () => ({ throttle: { active: 0, queued: 0 }, jobs: [RUNNING_JOB] }),
      onBatchDelete: () => {
        throw 'plain stop failure';
      },
    });
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
  });
});
