// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataMaintenance } from '@/components/DataMaintenance';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function duplicates(groups: { prefix: string; ids: string[] }[] = []) {
  return { groups };
}

function staleRow(index: number, overrides: Partial<{
  id: string;
  title: string;
  fetched_at: number;
  has_cover: boolean;
  has_egs: boolean;
}> = {}) {
  return {
    id: `v${index + 1}`,
    title: `VN ${index + 1}`,
    fetched_at: index,
    has_cover: true,
    has_egs: true,
    ...overrides,
  };
}

function stale(rows: ReturnType<typeof staleRow>[] = []) {
  return { rows };
}

function providerRow(overrides: Partial<{
  provider: 'sofmap' | 'surugaya' | 'melonbooks';
  latest_status_at: number | null;
  status_rows: number;
  last_batch_started_at: number | null;
  updated_after_last_batch: boolean | null;
}> = {}) {
  return {
    provider: 'sofmap' as const,
    latest_status_at: null,
    status_rows: 0,
    last_batch_started_at: null,
    updated_after_last_batch: null,
    ...overrides,
  };
}

function providers(rows: ReturnType<typeof providerRow>[] = []) {
  return { providers: rows };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DataMaintenance', () => {
  it('renders loading skeletons then empty summaries', async () => {
    const duplicateLoad = deferred<Response>();
    const staleLoad = deferred<Response>();
    const providerLoad = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(duplicateLoad.promise)
      .mockReturnValueOnce(staleLoad.promise)
      .mockReturnValueOnce(providerLoad.promise);
    const { container } = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('data-maintenance-skeleton');
    expect(container.querySelectorAll('[data-maintenance-skeleton-column]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-maintenance-skeleton-column="duplicates"] li')).toHaveLength(3);
    expect(container.querySelectorAll('[data-maintenance-skeleton-column="stale"] .h-11')).toHaveLength(6);
    expect(container.querySelectorAll('[data-maintenance-skeleton-column="providers"] li')).toHaveLength(3);

    await act(async () => {
      duplicateLoad.resolve(jsonResponse(duplicates()));
      staleLoad.resolve(jsonResponse(stale()));
      providerLoad.resolve(jsonResponse(providers()));
    });
    expect(screen.getByText(t.maintenance.dupEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.staleEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.providerEmpty)).toBeInTheDocument();
  });

  it('renders duplicate links, stale reasons, and the complete stale list on demand', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => staleRow(index));
    rows[0] = staleRow(0, { has_cover: false, has_egs: false });
    rows[1] = staleRow(1, { has_cover: true, has_egs: false });
    rows[2] = staleRow(2, { has_cover: false, has_egs: true });
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates([{ prefix: 'same-title', ids: ['V1', 'v2'] }])))
      .mockResolvedValueOnce(jsonResponse(stale(rows)))
      .mockResolvedValueOnce(jsonResponse(providers()));
    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();

    expect(screen.getByTitle('same-title')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'v1' })).toHaveAttribute('href', '/vn/v1');
    expect(screen.getByRole('link', { name: 'v2' })).toHaveAttribute('href', '/vn/v2');
    expect(screen.getByText(`/ ${t.maintenance.noCover}/ ${t.maintenance.noEgs}`)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t.maintenance.refresh })).toHaveLength(50);

    fireEvent.click(screen.getByRole('button', { name: `${t.steam.showAll} (1)` }));
    expect(screen.getAllByRole('button', { name: t.maintenance.refresh })).toHaveLength(51);
    fireEvent.click(screen.getByRole('button', { name: t.steam.showLess }));
    expect(screen.getAllByRole('button', { name: t.maintenance.refresh })).toHaveLength(50);
  });

  it('renders localized provider evidence for updated, missed, and not-yet-run sources', async () => {
    const latest = Date.UTC(2026, 0, 2, 3, 4);
    const batch = Date.UTC(2026, 0, 1, 2, 3);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers([
        providerRow({ latest_status_at: latest, status_rows: 4, last_batch_started_at: batch, updated_after_last_batch: true }),
        providerRow({ provider: 'surugaya', latest_status_at: null, status_rows: 2, last_batch_started_at: batch, updated_after_last_batch: false }),
        providerRow({ provider: 'melonbooks' }),
      ])));
    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();

    expect(screen.getByText('Sofmap / Recole')).toBeInTheDocument();
    expect(screen.getByText('Suruga-ya')).toBeInTheDocument();
    expect(screen.getByText('Melonbooks')).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.providerUpdatedAfterBatch)).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.providerMissedBatch)).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.providerNoBatch)).toBeInTheDocument();
    expect(screen.getByText(t.maintenance.providerRows.replace('{count}', '4'))).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp('Latest observation:'))).toHaveLength(3);
    expect(screen.getAllByText(new RegExp('Latest batch:'))).toHaveLength(2);
  });

  it('retries failed loads and reports duplicate, stale, malformed, and empty-message failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'duplicate failed' }, 500))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse({ error: 'stale failed' }, 500))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockResolvedValueOnce(jsonResponse({ groups: 'invalid' }))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse({ rows: 'invalid' }))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse({ providers: 'invalid' }))
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse({ error: 'provider failed' }, 500))
      .mockRejectedValueOnce(new Error(''))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers()));

    const first = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('duplicate failed');
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByRole('alert')).toHaveTextContent('stale failed');
    first.unmount();

    const second = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    second.unmount();

    const third = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    third.unmount();

    const fourth = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
    fourth.unmount();

    const fifth = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('provider failed');
    fifth.unmount();

    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.common.error);
  });

  it('ignores an aborted load without reporting an error', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.mocked(fetch)
      .mockRejectedValueOnce(aborted)
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers()));
    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes one stale VN at a time, reloads the summaries, and reports success', async () => {
    const refresh = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale([staleRow(0)])))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale()))
      .mockResolvedValueOnce(jsonResponse(providers()));
    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();
    const refreshButton = screen.getByRole('button', { name: t.maintenance.refresh });

    act(() => {
      refreshButton.click();
      refreshButton.click();
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/collection/v1/assets?refresh=true', expect.objectContaining({ method: 'POST' }));

    await act(async () => refresh.resolve(jsonResponse({ ok: true })));
    expect(await screen.findByRole('status')).toHaveTextContent(t.toast.saved);
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(t.maintenance.staleEmpty)).toBeInTheDocument();
  });

  it('reports refresh HTTP and network failures and unlocks the refresh controls', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale([staleRow(0)])))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockResolvedValueOnce(jsonResponse({ error: 'refresh failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: t.maintenance.refresh }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refresh failed');

    fireEvent.click(screen.getByRole('button', { name: t.maintenance.refresh }));
    expect(await screen.findByText('network failed')).toBeInTheDocument();
  });

  it('aborts obsolete load and refresh work after teardown', async () => {
    const duplicateLoad = deferred<Response>();
    const staleLoad = deferred<Response>();
    const providerLoad = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(duplicateLoad.promise)
      .mockReturnValueOnce(staleLoad.promise)
      .mockReturnValueOnce(providerLoad.promise);
    const first = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    const loadSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.unmount();
    expect(loadSignal?.aborted).toBe(true);
    await act(async () => {
      duplicateLoad.resolve(jsonResponse(duplicates()));
      staleLoad.resolve(jsonResponse(stale()));
      providerLoad.resolve(jsonResponse(providers()));
    });

    const refresh = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale([staleRow(0)])))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockReturnValueOnce(refresh.promise);
    const second = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: t.maintenance.refresh }));
    await flushAsync();
    const refreshSignal = vi.mocked(fetch).mock.calls[6]?.[1]?.signal;
    second.unmount();
    expect(refreshSignal?.aborted).toBe(true);
    await act(async () => refresh.reject(new Error('late refresh failure')));

    vi.mocked(fetch).mockReset();
    const successfulRefresh = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(duplicates()))
      .mockResolvedValueOnce(jsonResponse(stale([staleRow(0)])))
      .mockResolvedValueOnce(jsonResponse(providers()))
      .mockReturnValueOnce(successfulRefresh.promise);
    const third = renderWithProviders(<DataMaintenance />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: t.maintenance.refresh }));
    third.unmount();
    await act(async () => successfulRefresh.resolve(jsonResponse({ ok: true })));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });
});
