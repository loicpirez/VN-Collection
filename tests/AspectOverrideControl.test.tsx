// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AspectOverrideControl } from '@/components/AspectOverrideControl';
import type { AspectKey } from '@/lib/aspect-ratio';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries[DEFAULT_LOCALE];

function aspectResponse(
  derived: AspectKey,
  override: { aspect_key: AspectKey; note: string | null } | null,
) {
  return new Response(JSON.stringify({ derived, override }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AspectOverrideControl', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(aspectResponse('16:9', null));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading skeleton then the keys when no SSR-derived value is given', async () => {
    renderWithProviders(<AspectOverrideControl vnId="v90001" />);
    // Loading status visible first (initialDerived === undefined => loading true).
    expect(screen.getByRole('status')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: '16:9' })).toBeTruthy());
    // Every non-unknown key has a button.
    for (const key of ['4:3', '16:9', '16:10', '21:9', 'other']) {
      expect(screen.getByRole('button', { name: key })).toBeTruthy();
    }
  });

  it('paints the SSR-derived value immediately without a loading flash', async () => {
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="16:10" />);
    // No loading state because the server already supplied a derived value.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: '16:10' })).toBeTruthy();
    // It still re-fetches on mount to pick up cross-tab overrides.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/vn/v90001/aspect', expect.any(Object)));
  });

  it('PATCHes a chosen aspect key, marks it active, and toasts saved', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null)) // mount GET
      .mockResolvedValueOnce(aspectResponse('unknown', { aspect_key: '16:9', note: null })); // PATCH
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    await waitFor(() => expect(screen.getByText(t.toast.saved as string)).toBeTruthy());
    const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(patchCall![1].body)).toEqual({ aspect_key: '16:9' });
    expect(screen.getByRole('button', { name: '16:9' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('DELETEs the override when the active key is clicked again', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('16:9', { aspect_key: '4:3', note: null })) // mount GET (manual 4:3)
      .mockResolvedValueOnce(aspectResponse('16:9', null)); // DELETE clears override
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="16:9" initialOverride={{ aspect_key: '4:3', note: null }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '4:3' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '4:3' }));
    await waitFor(() => {
      const deleteCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeTruthy();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '4:3' }).getAttribute('aria-pressed')).toBe('false'));
  });

  it('shows the explicit clear button only when a manual override exists and uses DELETE', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('16:9', { aspect_key: '21:9', note: null }))
      .mockResolvedValueOnce(aspectResponse('16:9', null));
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="16:9" initialOverride={{ aspect_key: '21:9', note: null }} />);
    // The clear control carries the X icon; find it as the button after the keys.
    const clearBtn = screen.getAllByRole('button', { name: t.aspectOverride.clear as string });
    fireEvent.click(clearBtn[clearBtn.length - 1]);
    await waitFor(() => {
      const deleteCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(deleteCall).toBeTruthy();
    });
  });

  it('renders the derived hint when override differs from a known derived value', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(aspectResponse('16:9', { aspect_key: '4:3', note: null }));
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="16:9" initialOverride={{ aspect_key: '4:3', note: null }} />);
    await waitFor(() =>
      expect(screen.getByText((t.aspectOverride.derivedHint as string).replace('{key}', '16:9'))).toBeTruthy(),
    );
  });

  it('renders the no-data hint when nothing is derived and there is no override', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(aspectResponse('unknown', null));
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    await waitFor(() => expect(screen.getByText(t.aspectOverride.noDataHint as string)).toBeTruthy());
  });

  it('toasts the error message when a save fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null)) // mount GET
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'save failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
      );
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    fireEvent.click(screen.getByRole('button', { name: 'other' }));
    await waitFor(() => expect(screen.getByText('save failed')).toBeTruthy());
  });

  it('leaves the derived fallback visible when the initial load fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'load failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(<AspectOverrideControl vnId="v90001" />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByText(t.aspectOverride.noDataHint as string)).toBeTruthy();
  });

  it('leaves the derived fallback visible when the initial payload is invalid', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ derived: 'bogus', override: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    renderWithProviders(<AspectOverrideControl vnId="v90001" />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByText(t.aspectOverride.noDataHint as string)).toBeTruthy();
  });

  it('ignores an abort error from the initial load', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);
    renderWithProviders(<AspectOverrideControl vnId="v90001" />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('button', { name: '16:9' })).toBeTruthy();
  });

  it('does not start a second save while one is already pending', async () => {
    const pendingPatch = deferredResponse();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null))
      .mockReturnValueOnce(pendingPatch.promise);
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    const first = screen.getByRole('button', { name: '16:9' });
    const second = screen.getByRole('button', { name: '4:3' });
    act(() => {
      first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const patchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[1]?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);
    await act(async () => {
      pendingPatch.resolve(aspectResponse('unknown', { aspect_key: '16:9', note: null }));
    });
    await waitFor(() => expect(screen.getByText(t.toast.saved as string)).toBeTruthy());
  });

  it('toasts the generic error when a save response cannot be decoded', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null))
      .mockResolvedValueOnce(new Response(JSON.stringify({ derived: 'bad', override: null }), { status: 200 }));
    renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    fireEvent.click(screen.getByRole('button', { name: '16:10' }));
    await waitFor(() => expect(screen.getByText(t.common.error as string)).toBeTruthy());
  });

  it('ignores a successful save that resolves after the VN changes', async () => {
    const pendingPatch = deferredResponse();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null))
      .mockReturnValueOnce(pendingPatch.promise)
      .mockResolvedValue(aspectResponse('16:10', null));
    const view = renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    view.rerender(<AspectOverrideControl vnId="v90002" initialDerived="16:10" />);
    await act(async () => {
      pendingPatch.resolve(aspectResponse('unknown', { aspect_key: '16:9', note: null }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '16:10' })).toBeTruthy());
    expect(screen.queryByText(t.toast.saved as string)).toBeNull();
  });

  it('ignores a failed save that rejects after the VN changes', async () => {
    const pendingPatch = deferredResponse();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aspectResponse('unknown', null))
      .mockReturnValueOnce(pendingPatch.promise)
      .mockResolvedValue(aspectResponse('4:3', null));
    const view = renderWithProviders(<AspectOverrideControl vnId="v90001" initialDerived="unknown" />);
    fireEvent.click(screen.getByRole('button', { name: 'other' }));
    view.rerender(<AspectOverrideControl vnId="v90002" initialDerived="4:3" />);
    await act(async () => {
      pendingPatch.reject(new Error('late failure'));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '4:3' })).toBeTruthy());
    expect(screen.queryByText('late failure')).toBeNull();
  });
});
