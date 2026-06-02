// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportGameListButton } from '@/components/ExportGameListButton';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
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
  toastMocks.error.mockReset();
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:export'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportGameListButton', () => {
  it('downloads a generated game list through a transient object URL', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('game list', { status: 200 }));
    renderWithProviders(<ExportGameListButton />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.dataMgmt.exportGameList }));

    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/export/game-list', expect.objectContaining({ cache: 'no-store' }));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });

  it('shows a busy state and suppresses duplicate exports', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<ExportGameListButton />, { locale: 'en' });
    const button = screen.getByRole('button', { name: t.dataMgmt.exportGameList });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => pending.resolve(new Response('game list', { status: 200 })));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('reports HTTP and network errors', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'export failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<ExportGameListButton />, { locale: 'en' });
    const button = screen.getByRole('button', { name: t.dataMgmt.exportGameList });
    fireEvent.click(button);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('export failed'));

    fireEvent.click(button);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('network failed'));
  });

  it('aborts and ignores stale successful and rejected requests after teardown', async () => {
    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(success.promise);
    const first = renderWithProviders(<ExportGameListButton />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.dataMgmt.exportGameList }));
    const firstRequest = vi.mocked(fetch).mock.calls[0]?.[1];
    first.unmount();
    expect(firstRequest?.signal?.aborted).toBe(true);
    await act(async () => success.resolve(new Response('late list', { status: 200 })));
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(failure.promise);
    const second = renderWithProviders(<ExportGameListButton />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.dataMgmt.exportGameList }));
    second.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
