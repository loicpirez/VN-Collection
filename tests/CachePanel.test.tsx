// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CachePanel } from '@/components/CachePanel';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { fmtDate } from '@/lib/locale-number';
import { renderWithProviders } from './helpers/render-component';

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('@/components/ConfirmDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ConfirmDialog')>();
  return {
    ...actual,
    useConfirm: () => confirmMocks,
  };
});

vi.mock('@/components/Skeleton', () => ({
  SkeletonBlock: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: ({ children, title }: { children: React.ReactNode; title: string }) => <div>{`${title}: ${children}`}</div>,
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown = { ok: true }, status = 200): Response {
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

function stats(overrides: Partial<{
  total: number;
  fresh: number;
  stale: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
  by_path: { path: string; n: number }[];
}> = {}) {
  return {
    total: 3,
    fresh: 2,
    stale: 1,
    bytes: 2 * 1024 * 1024,
    oldest: null,
    newest: Date.UTC(2026, 0, 2),
    by_path: [{ path: '/vn', n: 3 }],
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CachePanel', () => {
  it('shows loading skeletons and toggles its expandable panel', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<CachePanel />, { locale: 'en' });
    const toggle = screen.getByRole('button', { name: t.cache.title });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
    fireEvent.click(toggle);
    expect(screen.queryAllByTestId('skeleton')).toHaveLength(0);

    await act(async () => pending.resolve(jsonResponse({ stats: stats() })));
    expect(screen.getByText(`3 ${t.cache.entries}`)).toBeInTheDocument();
  });

  it('renders byte units, timestamps, and optional endpoint rows', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stats: stats() }));
    const first = renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    expect(screen.getByText('2.00 MB')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText(fmtDate(new Date(Date.UTC(2026, 0, 2)), 'en'))).toBeInTheDocument();
    expect(screen.getByText('/vn')).toBeInTheDocument();
    first.unmount();

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stats: stats({ bytes: 12, by_path: [] }) }))
      .mockResolvedValueOnce(jsonResponse({ stats: stats({ bytes: 2048, by_path: [] }) }));
    const second = renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    expect(screen.getByText('12 B')).toBeInTheDocument();
    second.unmount();

    renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    expect(screen.getByText('2.0 kB')).toBeInTheDocument();
  });

  it('reports HTTP, malformed-payload, and network load failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'load failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ stats: { total: -1 } }))
      .mockRejectedValueOnce(new Error('network failed'));
    const first = renderWithProviders(<CachePanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.cache.title }));
    expect(await screen.findByText(`${t.common.error}: load failed`)).toBeInTheDocument();
    first.unmount();

    const second = renderWithProviders(<CachePanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.cache.title }));
    expect(await screen.findByText(`${t.common.error}: ${t.common.error}`)).toBeInTheDocument();
    second.unmount();

    renderWithProviders(<CachePanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.cache.title }));
    expect(await screen.findByText(`${t.common.error}: network failed`)).toBeInTheDocument();
  });

  it('prunes expired rows once and reloads fresh stats', async () => {
    const deletion = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stats: stats() }))
      .mockReturnValueOnce(deletion.promise)
      .mockResolvedValueOnce(jsonResponse({ stats: stats({ total: 1, fresh: 1, stale: 0 }) }));
    renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    const prune = screen.getByRole('button', { name: t.cache.pruneExpired });
    act(() => {
      prune.click();
      prune.click();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/vndb/cache?mode=expired', expect.objectContaining({ method: 'DELETE' }));

    await act(async () => deletion.resolve(jsonResponse()));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await screen.findByText(`1 ${t.cache.entries}`)).toBeInTheDocument();
  });

  it('cancels or completes confirmed full clears and reports delete errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stats: stats() }))
      .mockResolvedValueOnce(jsonResponse({ error: 'delete failed' }, 500))
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(jsonResponse({ stats: stats({ total: 0, fresh: 0, stale: 0, by_path: [] }) }));
    confirmMocks.confirm
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    const clear = screen.getByRole('button', { name: t.cache.clearAll });

    fireEvent.click(clear);
    await flushAsync();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(clear);
    await flushAsync();
    expect(screen.getByText(`${t.common.error}: delete failed`)).toBeInTheDocument();
    fireEvent.click(clear);
    await flushAsync();
    expect(fetch).toHaveBeenCalledWith('/api/vndb/cache', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText(`0 ${t.cache.entries}`)).toBeInTheDocument();
  });

  it('aborts obsolete load, confirmation, and delete work after teardown', async () => {
    const loading = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(loading.promise);
    const first = renderWithProviders(<CachePanel />, { locale: 'en' });
    const loadSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.unmount();
    expect(loadSignal?.aborted).toBe(true);
    await act(async () => loading.reject(new Error('late load')));

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ stats: stats() }));
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const second = renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    fireEvent.click(screen.getByRole('button', { name: t.cache.clearAll }));
    second.unmount();
    await act(async () => confirmation.resolve(true));
    expect(fetch).toHaveBeenCalledTimes(2);

    const deletion = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stats: stats() }))
      .mockReturnValueOnce(deletion.promise);
    confirmMocks.confirm.mockResolvedValueOnce(true);
    const third = renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    fireEvent.click(screen.getByRole('button', { name: t.cache.clearAll }));
    await flushAsync();
    const clearSignal = vi.mocked(fetch).mock.calls[3]?.[1]?.signal;
    third.unmount();
    expect(clearSignal?.aborted).toBe(true);
    await act(async () => deletion.reject(new Error('late delete')));

    vi.mocked(fetch).mockReset();
    const successfulLoad = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(successfulLoad.promise);
    const fourth = renderWithProviders(<CachePanel />, { locale: 'en' });
    fourth.unmount();
    await act(async () => successfulLoad.resolve(jsonResponse({ stats: stats() })));

    vi.mocked(fetch).mockReset();
    const successfulDeletion = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ stats: stats() }))
      .mockReturnValueOnce(successfulDeletion.promise);
    const fifth = renderWithProviders(<CachePanel />, { locale: 'en' });
    await flushAsync();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cache.title) }));
    fireEvent.click(screen.getByRole('button', { name: t.cache.clearAll }));
    await flushAsync();
    fifth.unmount();
    await act(async () => successfulDeletion.resolve(jsonResponse()));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
