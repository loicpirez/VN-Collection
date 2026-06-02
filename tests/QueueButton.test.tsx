// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueButton } from '@/components/QueueButton';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

const t = dictionaries.en;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function queueResponse(vnIds: string[] = []): Response {
  return jsonResponse({
    entries: vnIds.map((vn_id, index) => ({ vn_id, position: index + 1, added_at: index + 1 })),
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

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('QueueButton', () => {
  it('loads an unqueued VN and adds it to the reading queue', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse())
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });

    const add = await screen.findByRole('button', { name: t.readingQueue.addCta });
    fireEvent.click(add);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/reading-queue', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ vn_id: 'v90001' }),
    }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: t.readingQueue.removeCta })).toBeInTheDocument();
  });

  it('loads a queued VN and removes it from the reading queue', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse(['v90001']))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });

    const remove = await screen.findByRole('button', { name: t.readingQueue.removeCta });
    fireEvent.click(remove);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/reading-queue?vn_id=v90001', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByRole('button', { name: t.readingQueue.addCta })).toBeInTheDocument();
  });

  it('keeps the default state when the initial queue request fails or is malformed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'load failed' }, 500));
    const { rerender } = renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: t.readingQueue.addCta })).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ entries: 'invalid' }));
    rerender(<QueueButton vnId="v90002" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: t.readingQueue.addCta })).toBeInTheDocument();
  });

  it('reports mutation failures and suppresses duplicate clicks while busy', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse())
      .mockReturnValueOnce(mutation.promise);
    renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });
    const add = await screen.findByRole('button', { name: t.readingQueue.addCta });

    act(() => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => mutation.resolve(jsonResponse({ error: 'queue failed' }, 500)));
    expect(toastMocks.error).toHaveBeenCalledWith('queue failed');
  });

  it('reports failures while removing a queued VN', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse(['v90001']))
      .mockResolvedValueOnce(jsonResponse({ error: 'remove failed' }, 500));
    renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });

    fireEvent.click(await screen.findByRole('button', { name: t.readingQueue.removeCta }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('remove failed'));
  });

  it('ignores stale mutation completions after the VN identity changes', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse())
      .mockReturnValueOnce(mutation.promise)
      .mockResolvedValueOnce(queueResponse());
    const { rerender } = renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingQueue.addCta }));

    rerender(<QueueButton vnId="v90002" />);
    await act(async () => mutation.resolve(jsonResponse({ ok: true })));

    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale remove completions after the VN identity changes', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse(['v90001']))
      .mockReturnValueOnce(mutation.promise)
      .mockResolvedValueOnce(queueResponse());
    const { rerender } = renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingQueue.removeCta }));

    rerender(<QueueButton vnId="v90002" />);
    await act(async () => mutation.resolve(jsonResponse({ ok: true })));

    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale initial membership loads after the VN identity changes', async () => {
    const initial = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(queueResponse());
    const { rerender } = renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });

    rerender(<QueueButton vnId="v90002" />);
    await act(async () => initial.resolve(queueResponse(['v90001'])));

    expect(screen.getByRole('button', { name: t.readingQueue.addCta })).toBeInTheDocument();
  });

  it('ignores abort rejections from canceled mutations', async () => {
    const abortError = new Error('request canceled');
    abortError.name = 'AbortError';
    vi.mocked(fetch)
      .mockResolvedValueOnce(queueResponse())
      .mockRejectedValueOnce(abortError);
    renderWithProviders(<QueueButton vnId="v90001" />, { locale: 'en' });

    fireEvent.click(await screen.findByRole('button', { name: t.readingQueue.addCta }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
