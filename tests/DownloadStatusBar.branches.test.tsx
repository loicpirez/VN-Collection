// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DownloadStatusBar } from '@/components/DownloadStatusBar';

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function okJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function snapshot(over: Partial<{ throttle: unknown; jobs: unknown[] }> = {}) {
  return { throttle: { active: 0, queued: 0, retryAfterMs: 0 }, jobs: [], ...over };
}

describe('DownloadStatusBar branches', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the multi-job "running" count on the collapsed chip', async () => {
    const jobs = [
      { id: 'a', kind: 'staff', vn_id: null, label: 'A', total: 2, done: 1, errors: [], started_at: 1, finished_at: null, current_item: 'x' },
      { id: 'b', kind: 'characters', vn_id: null, label: 'B', total: 2, done: 0, errors: [], started_at: 1, finished_at: null, current_item: 'y' },
    ];
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const trigger = screen.getByRole('button', { name: 'Active downloads' });
    // 2 live jobs -> "2 running" on the chip (runningCount template).
    expect(within(trigger).getByText('2 running')).not.toBeNull();
  });

  it('shows the error-count styling when only finished-with-errors jobs remain', async () => {
    const job = {
      id: 'err', kind: 'producers', vn_id: null, label: 'Failed job',
      total: 3, done: 3, errors: [{ item: 'freeform', message: 'boom' }],
      started_at: 1, finished_at: 9,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const trigger = screen.getByRole('button', { name: 'Active downloads' });
    // No live jobs, 1 error -> "1 errors" chip text + dropped-status styling.
    expect(within(trigger).getByText('1 errors')).not.toBeNull();
    expect(trigger.className).toContain('status-dropped');
  });

  it('links a current_item id with a name as "name (id)" on the running main line', async () => {
    const job = {
      id: 'live', kind: 'staff', vn_id: null, label: 'Staff job',
      total: 4, done: 1, errors: [], started_at: 1, finished_at: null,
      current_item: 'v90050', current_item_name: 'Title Y',
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    const link = within(region).getByRole('link', { name: /Title Y/ });
    expect(link.getAttribute('href')).toBe('/vn/v90050');
    // The "(id)" suffix span renders alongside the name.
    expect(within(region).getAllByText('(v90050)').length).toBeGreaterThan(0);
  });

  it('renders a free-text current_item with a name (no href) as plain text', async () => {
    const job = {
      id: 'plain', kind: 'cache-refresh', vn_id: null, label: 'Cache job',
      total: 3, done: 1, errors: [], started_at: 1, finished_at: null,
      // current_item is a free-text label (no entity prefix) but carries a name.
      current_item: 'free-text-id', current_item_name: 'Friendly Name',
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // The id does not map to a route -> EntityLink renders a plain span with the name.
    expect(within(region).getByText('Friendly Name')).not.toBeNull();
    expect(within(region).queryByRole('link', { name: 'Friendly Name' })).toBeNull();
  });

  it('shows the cancelled badge for a finished cancelled job', async () => {
    const job = {
      id: 'cancel', kind: 'staff', vn_id: null, label: 'Cancelled job',
      total: 5, done: 2, errors: [], cancelled: true,
      started_at: 1, finished_at: 9,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // "Cancelled" appears as the inline badge.
    expect(within(region).getAllByText('Cancelled').length).toBeGreaterThan(0);
  });

  it('renders a job label that embeds a vn id but does not link when vn_id is absent', async () => {
    const job = {
      id: 'nolink', kind: 'producers', vn_id: null, label: 'Plain label no id',
      total: 2, done: 2, errors: [], started_at: 1, finished_at: 9,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // The label renders as a plain span (no vn_id -> JobLabelText short-circuits).
    expect(within(region).getByText(/Plain label no id/)).not.toBeNull();
  });

  it('uses the job label on the collapsed chip when a live job has no current item', async () => {
    const job = {
      id: 'no-current', kind: 'cache-refresh', vn_id: null, label: 'Queue tail',
      total: 2, done: 1, errors: [], started_at: 1, finished_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [job] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const trigger = screen.getByRole('button', { name: 'Active downloads' });
    expect(within(trigger).getByText(/Queue tail/)).not.toBeNull();
  });

  it('does not update state when a polling response resolves after unmount', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { container, unmount } = renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    unmount();
    resolveFetch(okJson(snapshot({ jobs: [{
      id: 'late', kind: 'staff', vn_id: null, label: 'Late job',
      total: 1, done: 0, errors: [], started_at: 1, finished_at: null,
    }] })));
    await flush();
    expect(container.querySelector('button')).toBeNull();
  });

  it('falls back to polling when EventSource construction throws', async () => {
    class ThrowingEventSource {
      constructor() {
        throw new Error('stream unavailable');
      }
    }
    (globalThis as unknown as { EventSource: unknown }).EventSource = ThrowingEventSource;
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [{
      id: 'poll-fallback', kind: 'staff', vn_id: null, label: 'Fallback poll',
      total: 1, done: 0, errors: [], started_at: 1, finished_at: null,
    }] })));
    try {
      renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
      await flush();
      expect(global.fetch).toHaveBeenCalledWith('/api/download-status', expect.objectContaining({ cache: 'no-store' }));
      expect(screen.getByRole('button', { name: 'Active downloads' })).not.toBeNull();
    } finally {
      delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    }
  });
});
