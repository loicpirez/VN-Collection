// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DownloadStatusBar } from '@/components/DownloadStatusBar';

/** Flush the polling/SSE microtask chain inside React's act() boundary. */
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
  return {
    throttle: { active: 0, queued: 0, retryAfterMs: 0 },
    jobs: [],
    ...over,
  };
}

const LIVE_JOB = {
  id: 'job-live-1',
  kind: 'staff',
  vn_id: 'v90010',
  vn_title: 'Title Y',
  label: 'Staff for v90010',
  label_code: 'staff_for_vn',
  label_params: { vnId: 'v90010' },
  total: 4,
  done: 1,
  current_item: 'v90010',
  current_item_name: 'Title Y',
  errors: [],
  started_at: 1,
  finished_at: null,
};

const FINISHED_JOB = {
  id: 'job-done-1',
  kind: 'characters',
  vn_id: null,
  label: 'Studios for v90011',
  total: 5,
  done: 5,
  errors: [],
  started_at: 1,
  finished_at: 2,
};

const ERROR_JOB = {
  id: 'job-err-1',
  kind: 'producers',
  vn_id: null,
  label: 'Global refresh',
  label_code: 'global_refresh',
  total: 6,
  done: 6,
  errors: [
    { item: 'v90020', message: 'fail a' },
    { item: 'p90021', message: 'fail b' },
    { item: 's90023', message: 'fail s' },
    { item: 'c90024', message: 'fail c' },
    { item: 'g90025', message: 'fail g' },
    { item: 'i90026', message: 'fail i' },
    { item: 'freeform label', message: 'fail free' },
    { item: 'v90022', message: 'fail d' },
  ],
  started_at: 1,
  finished_at: 3,
};

describe('DownloadStatusBar (polling fallback path)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing when the snapshot has no jobs and no throttle activity', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot()));
    const { container } = renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing when the fetch responds non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ error: 'no' }, 500));
    const { container } = renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(container.querySelector('button')).toBeNull();
  });

  it('survives a rejected fetch and renders nothing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('net down'));
    const { container } = renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the collapsed chip with the live job task and a done/total counter', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [LIVE_JOB], throttle: { active: 2, queued: 1 } })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const trigger = screen.getByRole('button', { name: 'Active downloads' });
    expect(trigger).not.toBeNull();
    // Single live job -> chip shows "Staff / Title Y (v90010)" and 1/4.
    expect(within(trigger).getByText(/Title Y/)).not.toBeNull();
    expect(within(trigger).getByText('1/4')).not.toBeNull();
    expect(within(trigger).getByText(/2\/1/)).not.toBeNull();
  });

  it('handles a zero-total progress bar', async () => {
    const zeroTotalJob = {
      id: 'job-zero',
      kind: 'cache-refresh',
      vn_id: null,
      label: 'Custom label',
      total: 0,
      done: 0,
      current_item: 'custom item',
      errors: [],
      started_at: 1,
      finished_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [zeroTotalJob] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    expect(within(region).getAllByText(/Refresh/).length).toBeGreaterThan(0);
    const progressbar = within(region).getByRole('progressbar', { name: /Custom label/ });
    expect(progressbar.getAttribute('aria-valuemax')).toBe('1');
  });

  it('shows the empty popover when only throttle activity is present', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ throttle: { active: 1, queued: 0, retryAfterMs: 0 } })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    expect(within(region).getByText('No recent downloads.')).not.toBeNull();
  });

  it('opens the popover and links the VN embedded in a finished job label', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [{ ...FINISHED_JOB, vn_id: 'v90011', vn_title: 'Title Z' }] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // Finished job label embeds the VN id, rendered as a link to /vn/v90011.
    const vnLink = within(region).getByRole('link', { name: /Title Z/ });
    expect(vnLink.getAttribute('href')).toBe('/vn/v90011');
    fireEvent.click(vnLink);
    expect(screen.getByRole('region', { name: 'Active downloads' })).not.toBeNull();
  });

  it('dismisses one finished job, collapsing the whole bar when nothing remains', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [{ ...FINISHED_JOB, vn_id: 'v90011' }] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    fireEvent.click(within(region).getByRole('button', { name: 'Dismiss' }));
    // The only job is gone -> hasAnything is false -> the component renders null.
    expect(screen.queryByText(/Studios for/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Active downloads' })).toBeNull();
  });

  it('runs the dismiss-all control for finished jobs', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [FINISHED_JOB] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    fireEvent.click(within(region).getByRole('button', { name: 'Dismiss all' }));
    // Dismissing the last finished job collapses the whole bar.
    expect(screen.queryByRole('button', { name: 'Active downloads' })).toBeNull();
  });

  it('expands and collapses the truncated error list for a failed job', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [ERROR_JOB] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // 8 errors, only first 3 shown -> "+5" toggle. Entity-id errors link out.
    expect(within(region).getByRole('link', { name: 'v90020' }).getAttribute('href')).toBe('/vn/v90020');
    expect(within(region).getByRole('link', { name: 'p90021' }).getAttribute('href')).toBe('/producer/p90021');
    expect(within(region).queryByText(/fail d/)).toBeNull();
    const expandToggle = within(region).getByRole('button', { name: '+5' });
    // The error toggle lives inside the per-job error <ul>; scope to it so the
    // collapsed-state "Close" label doesn't collide with the header close icon.
    const errorList = expandToggle.closest('ul') as HTMLElement;
    fireEvent.click(expandToggle);
    expect(within(region).getByText(/fail d/)).not.toBeNull();
    // Every entity-id prefix maps to its local route; free-text stays plain.
    expect(within(region).getByRole('link', { name: 's90023' }).getAttribute('href')).toBe('/staff/s90023');
    expect(within(region).getByRole('link', { name: 'c90024' }).getAttribute('href')).toBe('/character/c90024');
    expect(within(region).getByRole('link', { name: 'g90025' }).getAttribute('href')).toBe('/tag/g90025');
    expect(within(region).getByRole('link', { name: 'i90026' }).getAttribute('href')).toBe('/trait/i90026');
    expect(within(region).queryByRole('link', { name: 'freeform label' })).toBeNull();
    fireEvent.click(within(errorList).getByRole('button', { expanded: true }));
    expect(within(region).queryByText(/fail d/)).toBeNull();
  });

  it('renders templated job labels and templated current-item codes in the popover', async () => {
    const templatedJob = {
      id: 'job-tmpl-1',
      kind: 'cache-refresh',
      vn_id: null,
      label: 'fallback label',
      label_code: 'global_refresh',
      total: 10,
      done: 4,
      current_item: 'whatever',
      current_item_code: 'refresh_egs_top_ranked',
      current_item_params: { count: 100 },
      errors: [],
      started_at: 1,
      finished_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [templatedJob] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    // current_item_code resolves through the currentItems template map.
    expect(within(region).getByText(/EGS top-ranked \(top 100\)/)).not.toBeNull();
  });

  it('falls back to the raw current item template for unknown current-item codes', async () => {
    const unknownCodeJob = {
      id: 'job-unknown-code',
      kind: 'cache-refresh',
      vn_id: null,
      label: 'fallback label',
      total: 10,
      done: 4,
      current_item: 'Raw current {count}',
      current_item_code: 'missing_template_code',
      current_item_params: { count: 7 },
      errors: [],
      started_at: 1,
      finished_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [unknownCodeJob] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    expect(within(region).getByText('Raw current 7')).not.toBeNull();
  });

  it('renders a current_item without a code as a non-linked plain id', async () => {
    const plainItemJob = {
      id: 'job-plain-1',
      kind: 'vn-fetch',
      vn_id: null,
      label: 'Releases for v90030',
      total: 3,
      done: 1,
      // current_item is a free-text label (no code, no name) -> rendered as-is.
      current_item: 'free text item',
      errors: [],
      started_at: 1,
      finished_at: null,
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [plainItemJob] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    expect(within(region).getByText(/free text item/)).not.toBeNull();
  });

  it('recreates the poll on visibilitychange while hidden then visible', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [LIVE_JOB] })));
    global.fetch = fetchMock;
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const callsBefore = fetchMock.mock.calls.length;
    // Hidden -> the handler early-returns without re-polling.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    // Visible -> the handler kicks a fresh poll.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('closes the popover via the header close button', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [LIVE_JOB] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    const region = screen.getByRole('region', { name: 'Active downloads' });
    fireEvent.click(within(region).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Active downloads' })).toBeNull();
  });

  it('closes the popover when Escape is pressed', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ jobs: [LIVE_JOB] })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Active downloads' }));
    expect(screen.getByRole('region', { name: 'Active downloads' })).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'Active downloads' })).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Active downloads' })).toBeNull();
  });

  it('renders the retry banner and ticks the countdown on the 500ms interval', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot({ throttle: { active: 0, queued: 0, retryAfterMs: 2_000 } })));
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(screen.getByText('VNDB returned 429')).not.toBeNull();
    expect(screen.getByText('Retrying in 2s')).not.toBeNull();
    // Advance ~1s; the smooth local countdown drops to 1s.
    await flush(1_000);
    expect(screen.getByText('Retrying in 1s')).not.toBeNull();
  });
});

class FakeEventSource {
  static OPEN = 1;
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  url: string;
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  fail() {
    this.readyState = 2;
    this.onerror?.();
  }
  close() {
    this.closed = true;
  }
}

describe('DownloadStatusBar (SSE path)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    global.fetch = vi.fn().mockResolvedValue(okJson(snapshot()));
  });
  afterEach(() => {
    delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens an EventSource and renders snapshots pushed over the stream', async () => {
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/download-status/stream');
    // No fetch on the SSE path while the stream is healthy.
    expect(global.fetch).not.toHaveBeenCalled();
    act(() => FakeEventSource.instances[0].emit(snapshot({ jobs: [LIVE_JOB] })));
    expect(screen.getByRole('button', { name: 'Active downloads' })).not.toBeNull();
  });

  it('ignores a malformed SSE frame without crashing', async () => {
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const es = FakeEventSource.instances[0];
    act(() => es.onmessage?.({ data: 'not json{' }));
    act(() => es.emit(snapshot({ jobs: [LIVE_JOB] })));
    expect(screen.getByRole('button', { name: 'Active downloads' })).not.toBeNull();
  });

  it('falls back to polling when the EventSource closes for good', async () => {
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
    // Stream gives up (readyState CLOSED) -> component starts polling.
    act(() => FakeEventSource.instances[0].fail());
    await flush();
    expect(global.fetch).toHaveBeenCalledWith('/api/download-status', expect.objectContaining({ cache: 'no-store' }));
  });

  it('keeps the stream open when EventSource reports a transient error', async () => {
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const es = FakeEventSource.instances[0];
    act(() => {
      es.readyState = 1;
      es.onerror?.();
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
  });

  it('ignores SSE messages after unmount', async () => {
    const { unmount } = renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    const es = FakeEventSource.instances[0];
    unmount();
    act(() => es.emit(snapshot({ jobs: [LIVE_JOB] })));
    expect(screen.queryByRole('button', { name: 'Active downloads' })).toBeNull();
  });

  it('recreates the EventSource when the tab becomes visible again', async () => {
    renderWithProviders(<DownloadStatusBar />, { locale: 'en' });
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    // A fresh stream is opened (the old one is closed first).
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
