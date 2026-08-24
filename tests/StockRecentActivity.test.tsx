// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StockRecentActivity } from '@/components/StockRecentActivity';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function queue(entries: Array<{ vn_id: string; title: string | null }>) {
  return { scope: 'recent_checked', entries, next_page: null };
}

function snapshot() {
  return {
    throttle: { active: 0, queued: 0 },
    jobs: [
      {
        id: 'newer', kind: 'stock-batch', vn_id: null, label: 'Fallback newer',
        label_code: 'stock_refresh', label_params: { count: 2 }, total: 2, done: 2,
        errors: [{ item: 'v90002', message: 'blocked' }], started_at: 100, finished_at: 300,
      },
      {
        id: 'older', kind: 'stock-batch', vn_id: null, label: 'Older batch',
        total: 4, done: 4, errors: [], started_at: 50, finished_at: 200,
      },
      {
        id: 'active', kind: 'stock-batch', vn_id: null, label: 'Active batch',
        total: 1, done: 0, errors: [], started_at: 400, finished_at: null,
      },
      {
        id: 'other', kind: 'vn-fetch', vn_id: null, label: 'Other job',
        total: 1, done: 1, errors: [], started_at: 10, finished_at: 500,
      },
    ],
  };
}

function activityFetch(entries: Array<{ vn_id: string; title: string | null }>, status = snapshot()) {
  return vi.fn(async (url: RequestInfo | URL) => String(url).startsWith('/api/stock/queue')
    ? json(queue(entries))
    : json(status));
}

describe('StockRecentActivity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders recent checks and completed stock batches in descending completion order', async () => {
    global.fetch = activityFetch([
      { vn_id: 'v90001', title: 'Recent title' },
      { vn_id: 'v90002', title: null },
    ]);
    renderWithProviders(<StockRecentActivity />, { locale: 'en' });

    expect(screen.getByLabelText(t.common.loading)).toHaveAttribute('aria-busy', 'true');
    const recent = await screen.findByRole('link', { name: /Recent title/ });
    expect(recent).toHaveAttribute('href', '/stock?vn=v90001');
    expect(screen.getByRole('link', { name: /v90002/ })).toHaveAttribute('href', '/stock?vn=v90002');
    expect(screen.getByRole('link', { name: t.stock.openBatchTools })).toHaveAttribute('href', '#stock-batch');
    expect(screen.getByText('Stock refresh x 2')).toBeInTheDocument();
    expect(screen.getByText('Older batch')).toBeInTheDocument();
    expect(screen.queryByText('Active batch')).toBeNull();
    expect(screen.queryByText('Other job')).toBeNull();
    const rows = screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('batch') || item.textContent?.includes('Stock refresh'));
    expect(rows[0]).toHaveTextContent('Stock refresh x 2');
    expect(screen.getByText('2/2 processed, 1 error(s)')).toBeInTheDocument();
  });

  it('renders a clear empty state when neither checks nor batches exist', async () => {
    global.fetch = activityFetch([], { throttle: { active: 0, queued: 0 }, jobs: [] });
    renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    expect(await screen.findByText(t.stock.recentActivityEmpty)).toBeInTheDocument();
  });

  it('reports a failed request and retries both activity sources', async () => {
    let failing = true;
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (failing && String(url).startsWith('/api/stock/queue')) return json({ error: 'history failed' }, 503);
      return String(url).startsWith('/api/stock/queue')
        ? json(queue([]))
        : json({ throttle: { active: 0, queued: 0 }, jobs: [] });
    });
    renderWithProviders(<StockRecentActivity />, { locale: 'en' });

    expect(await screen.findByRole('alert')).toHaveTextContent('history failed');
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByText(t.stock.recentActivityEmpty)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('rejects malformed envelopes and keeps abort errors non-disruptive', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => String(url).startsWith('/api/stock/queue')
      ? json({ broken: true })
      : json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
    const malformed = renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    malformed.unmount();

    const abort = new Error('aborted');
    abort.name = 'AbortError';
    global.fetch = vi.fn(async () => { throw abort; });
    renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports download-status failures and message-less request failures', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => String(url).startsWith('/api/stock/queue')
      ? json(queue([]))
      : json({ error: 'jobs failed' }, 502));
    const statusFailure = renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('jobs failed');
    statusFailure.unmount();

    global.fetch = vi.fn(async () => { throw new Error(''); });
    renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('ignores a successful activity response that settles after unmount', async () => {
    let resolveQueue: (response: Response) => void = () => undefined;
    let resolveStatus: (response: Response) => void = () => undefined;
    global.fetch = vi.fn((url: RequestInfo | URL) => new Promise<Response>((resolve) => {
      if (String(url).startsWith('/api/stock/queue')) resolveQueue = resolve;
      else resolveStatus = resolve;
    }));
    const view = renderWithProviders(<StockRecentActivity />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    view.unmount();

    await act(async () => {
      resolveQueue(json(queue([{ vn_id: 'v90003', title: 'Late' }])));
      resolveStatus(json({ throttle: { active: 0, queued: 0 }, jobs: [] }));
      await Promise.resolve();
    });
    expect(screen.queryByText('Late')).toBeNull();
  });
});
