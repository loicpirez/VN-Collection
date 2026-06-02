// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesAutoSuggest } from '@/components/SeriesAutoSuggest';
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

function suggestion(overrides: Partial<{
  existing: { id: number; name: string }[];
  suggestedName: string | null;
  relatedInCollection: { id: string; title: string; relation: string }[];
}> = {}) {
  return {
    existing: [{ id: 3, name: 'Existing' }],
    suggestedName: 'Suggested',
    relatedInCollection: [{ id: 'v2', title: 'Related', relation: 'seq' }],
    ...overrides,
  };
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
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

describe('SeriesAutoSuggest', () => {
  it('renders only actionable suggestions and resets dismissal when the VN changes', () => {
    const { container, rerender } = renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={null} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
    rerender(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [], suggestedName: null })} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<SeriesAutoSuggest vnId="v1" suggestion={suggestion()} />);
    expect(screen.getByText(/Related/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(container).toBeEmptyDOMElement();

    rerender(<SeriesAutoSuggest vnId="v2" suggestion={suggestion({ relatedInCollection: [] })} />);
    expect(screen.queryByText(/Related/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` })).toBeInTheDocument();
  });

  it('joins an existing series once and refreshes after success', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion()} />, { locale: 'en' });
    const join = screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` });
    act(() => {
      join.click();
      join.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/series/3/vn/v1', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ expand: true }),
    }));
    expect(join).toBeDisabled();

    await act(async () => pending.resolve(jsonResponse()));
    expect(toastMocks.success).toHaveBeenCalledWith(t.seriesAutoSuggest.added);
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports existing-series HTTP and network failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'join failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ suggestedName: null })} />, { locale: 'en' });
    const join = screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` });
    fireEvent.click(join);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('join failed');
    fireEvent.click(join);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('network failed');
  });

  it('creates and links a suggested series before refreshing', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ series: { id: 7 } }))
      .mockResolvedValueOnce(jsonResponse());
    renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` }));
    await flushAsync();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/series', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'Suggested' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/series/7/vn/v1', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ expand: true }),
    }));
    expect(toastMocks.success).toHaveBeenCalledWith(t.seriesAutoSuggest.created);
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('suppresses duplicate suggested-series creates while one is in flight', () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    const create = screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` });
    act(() => {
      create.click();
      create.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports create, malformed-id, and link failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'create failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ series: { id: 'invalid' } }))
      .mockResolvedValueOnce(jsonResponse({ series: { id: 7 } }))
      .mockResolvedValueOnce(jsonResponse({ error: 'link failed' }, 500));
    renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    const create = screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` });

    fireEvent.click(create);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('create failed');
    fireEvent.click(create);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith(t.common.error);
    fireEvent.click(create);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('link failed');
  });

  it('aborts obsolete join completions after the VN changes or unmounts', async () => {
    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(success.promise);
    const first = renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ suggestedName: null })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` }));
    const successSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.rerender(<SeriesAutoSuggest vnId="v2" suggestion={suggestion({ suggestedName: null })} />);
    expect(successSignal?.aborted).toBe(true);
    await act(async () => success.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();
    first.unmount();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(failure.promise);
    const second = renderWithProviders(<SeriesAutoSuggest vnId="v3" suggestion={suggestion({ suggestedName: null })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.joinExisting}: Existing` }));
    second.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('ignores obsolete create-link completion after the VN changes', async () => {
    const link = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ series: { id: 7 } }))
      .mockReturnValueOnce(link.promise);
    const mounted = renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` }));
    await flushAsync();
    const linkSignal = vi.mocked(fetch).mock.calls[1]?.[1]?.signal;
    mounted.rerender(<SeriesAutoSuggest vnId="v2" suggestion={suggestion({ existing: [] })} />);
    expect(linkSignal?.aborted).toBe(true);
    await act(async () => link.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('does not link or report errors after an obsolete create request settles', async () => {
    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(success.promise);
    const first = renderWithProviders(<SeriesAutoSuggest vnId="v1" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` }));
    first.rerender(<SeriesAutoSuggest vnId="v2" suggestion={suggestion({ existing: [] })} />);
    await act(async () => success.resolve(jsonResponse({ series: { id: 7 } })));
    expect(fetch).toHaveBeenCalledTimes(1);
    first.unmount();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(failure.promise);
    const second = renderWithProviders(<SeriesAutoSuggest vnId="v3" suggestion={suggestion({ existing: [] })} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: `${t.seriesAutoSuggest.createNew}: Suggested` }));
    second.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
