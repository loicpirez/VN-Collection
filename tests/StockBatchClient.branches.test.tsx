// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
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
});
