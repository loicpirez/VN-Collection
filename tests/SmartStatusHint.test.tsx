// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartStatusHint } from '@/components/SmartStatusHint';
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

function hint(overrides: Partial<{
  vnId: string;
  status: string | null;
  playtimeMinutes: number | null;
  vndbLengthMinutes: number | null;
}> = {}) {
  return (
    <SmartStatusHint
      vnId="v1"
      status="playing"
      playtimeMinutes={120}
      vndbLengthMinutes={120}
      {...overrides}
    />
  );
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

describe('SmartStatusHint', () => {
  it('renders only after the playing threshold is reached and supports dismissal reset', () => {
    const rendered = renderWithProviders(hint({ status: null }), { locale: 'en' });
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ playtimeMinutes: null }));
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ playtimeMinutes: 0 }));
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ vndbLengthMinutes: null }));
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ vndbLengthMinutes: 0 }));
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ playtimeMinutes: 119 }));
    expect(rendered.container).toBeEmptyDOMElement();

    rendered.rerender(hint());
    expect(screen.getByText(t.smartStatus.hint)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(rendered.container).toBeEmptyDOMElement();
    rendered.rerender(hint({ vnId: 'v2' }));
    expect(screen.getByText(t.smartStatus.hint)).toBeInTheDocument();
  });

  it('marks the VN complete once and refreshes after success', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(hint(), { locale: 'en' });
    const complete = screen.getByRole('button', { name: t.smartStatus.markCompleted });
    act(() => {
      complete.click();
      complete.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/collection/v1', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringMatching(/"status":"completed","finished_date":"\d{4}-\d{2}-\d{2}"/),
    }));
    expect(complete).toBeDisabled();

    await act(async () => mutation.resolve(jsonResponse()));
    expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved);
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: t.smartStatus.markCompleted })).toBeEnabled();
  });

  it('reports HTTP and network failures but ignores abort errors', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'patch failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'))
      .mockRejectedValueOnce(aborted);
    renderWithProviders(hint(), { locale: 'en' });
    const complete = screen.getByRole('button', { name: t.smartStatus.markCompleted });

    fireEvent.click(complete);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('patch failed');
    fireEvent.click(complete);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('network failed');
    fireEvent.click(complete);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledTimes(2);
  });

  it('aborts and ignores stale successful and failed mutations after identity changes or teardown', async () => {
    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(success.promise);
    const first = renderWithProviders(hint(), { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.smartStatus.markCompleted }));
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.rerender(hint({ vnId: 'v2' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => success.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(failure.promise);
    fireEvent.click(screen.getByRole('button', { name: t.smartStatus.markCompleted }));
    first.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
