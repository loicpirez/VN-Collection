// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshCachedCredits, WorksCacheLoader } from '@/components/WorksCacheLoader';
import { renderWithProviders } from './helpers/render-component';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const summary = { developers: 1, publishers: 0, owned: 1, stale: false };
function response(body = summary, status = 200) { return new Response(JSON.stringify(body), { status }); }
beforeEach(() => { router.refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('credit cache hydration', () => {
  it('reconciles a streamed staff snapshot once while preserving the rendered page', () => {
    const view = renderWithProviders(<RefreshCachedCredits />);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    view.rerender(<RefreshCachedCredits />);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it('uses a complete snapshot without any network request', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const { container } = renderWithProviders(<WorksCacheLoader producerId="p90001" needed={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(request).not.toHaveBeenCalled();
  });

  it('shows loading until a successful hydration refreshes the server snapshot', async () => {
    let complete: (value: Response) => void = () => {};
    const request = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', request);
    const view = renderWithProviders(<WorksCacheLoader producerId="p90001" needed />, { locale: 'en' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(request).toHaveBeenCalledWith('/api/producer/p90001/refresh', expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }));
    await act(async () => { complete(response()); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    view.rerender(<WorksCacheLoader producerId="p90001" needed={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['http', 'invalid', 'stale', 'network'] as const)('provides a real retry for %s failure', async (failure) => {
    const request = vi.fn<() => Promise<Response>>();
    if (failure === 'network') request.mockRejectedValueOnce(new Error('offline'));
    else request.mockResolvedValueOnce(failure === 'http' ? response(summary, 502) : failure === 'stale' ? response({ ...summary, stale: true }) : new Response('{}'));
    request.mockResolvedValue(response());
    vi.stubGlobal('fetch', request);
    renderWithProviders(<WorksCacheLoader producerId="p90001" needed />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('VNDB is unavailable');
    expect(router.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([true, false])('ignores an obsolete request completion (success=%s)', async (success) => {
    let resolve: (value: Response) => void = () => {};
    let reject: (reason: Error) => void = () => {};
    const pending = new Promise<Response>((accept, fail) => { resolve = accept; reject = fail; });
    const request = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(response());
    vi.stubGlobal('fetch', request);
    const view = renderWithProviders(<WorksCacheLoader producerId="p90001" needed />);
    const signal: AbortSignal = request.mock.calls[0][1].signal;
    view.rerender(<WorksCacheLoader producerId="p90002" needed />);
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    await act(async () => { if (success) resolve(response()); else reject(new Error('late failure')); });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
