// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListRemoveVn } from '@/components/ListRemoveVn';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
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

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListRemoveVn', () => {
  it('removes an item and refreshes the list', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<ListRemoveVn listId={7} vnId="egs_123" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));

    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/lists/7/items?vn=egs_123', expect.objectContaining({ method: 'DELETE' }));
  });

  it('reports API failures and suppresses duplicate clicks while busy', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(<ListRemoveVn listId={7} vnId="v90001" />, { locale: 'en' });
    const remove = screen.getByRole('button', { name: t.lists.removeFromList });

    act(() => {
      fireEvent.click(remove);
      fireEvent.click(remove);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => mutation.resolve(jsonResponse({ error: 'remove failed' }, 500)));
    expect(toastMocks.error).toHaveBeenCalledWith('remove failed');
  });

  it('ignores stale successful completions after the item identity changes', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const { rerender } = renderWithProviders(<ListRemoveVn listId={7} vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));

    rerender(<ListRemoveVn listId={7} vnId="v90002" />);
    await act(async () => mutation.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale rejected completions after the item identity changes', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const { rerender } = renderWithProviders(<ListRemoveVn listId={7} vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.removeFromList }));

    rerender(<ListRemoveVn listId={8} vnId="v90001" />);
    await act(async () => mutation.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
