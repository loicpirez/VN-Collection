// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { RecommendationRemoteLoader } from '@/components/RecommendationRemoteLoader';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => {
  const refresh = vi.fn();
  return {
    refresh,
    router: {
      push: vi.fn(),
      replace: vi.fn(),
      refresh,
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => navigationMocks.router }));

function response(body: object | string, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function loader(enabled = true) {
  return (
    <RecommendationRemoteLoader
      enabled={enabled}
      mode="similar-to-vn"
      includeEro
      includeOwned={false}
      includeWishlist
      customTagIds={['g90001', 'g90002']}
      seedVnId="v90001"
    />
  );
}

afterEach(() => {
  navigationMocks.refresh.mockReset();
  vi.restoreAllMocks();
});

describe('RecommendationRemoteLoader', () => {
  it('stays idle when every snapshot is fresh', async () => {
    global.fetch = vi.fn();
    renderWithProviders(loader(false), { locale: 'en' });
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hydrates the active filters and refreshes the server snapshot', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ ok: true, complete: true, results: 3 }));
    renderWithProviders(loader(), { locale: 'en' });
    expect(screen.getByRole('status').textContent).toContain('Refreshing VNDB recommendations');
    await vi.waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith('/api/recommendations/hydrate', expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'similar-to-vn',
        includeEro: true,
        includeOwned: false,
        includeWishlist: true,
        customTagIds: ['g90001', 'g90002'],
        seedVnId: 'v90001',
      }),
    }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('omits the seed field outside seeded recommendation mode', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ ok: true, complete: true, results: 0 }));
    renderWithProviders(
      <RecommendationRemoteLoader
        enabled
        mode="tag-based"
        includeEro={false}
        includeOwned={false}
        includeWishlist={false}
        customTagIds={[]}
      />,
      { locale: 'en' },
    );
    await vi.waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    const init = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      mode: 'tag-based',
      includeEro: false,
      includeOwned: false,
      includeWishlist: false,
      customTagIds: [],
    });
  });

  it('shows a retry after partial hydration and completes the retry', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, complete: false, results: 1 }))
      .mockResolvedValueOnce(response({ ok: true, complete: true, results: 2 }));
    renderWithProviders(loader(), { locale: 'en' });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alert').textContent).toContain('Some recommendations could not be refreshed');
    fireEvent.click(retry);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('uses a generic error for rejected, malformed, and unsuccessful responses', async () => {
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('private failure'))
      .mockResolvedValueOnce(response('{', 200))
      .mockResolvedValueOnce(response({ ok: false }, 502))
      .mockResolvedValueOnce(response({ ok: true, complete: true }));
    renderWithProviders(loader(), { locale: 'en' });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be refreshed');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByText('private failure')).toBeNull();
  });

  it('ignores late success and failure after aborting on unmount', async () => {
    let resolveRequest: (value: Response) => void = () => {};
    let rejectRequest: (error: Error) => void = () => {};
    global.fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectRequest = reject; }));
    const first = renderWithProviders(loader(), { locale: 'en' });
    first.unmount();
    resolveRequest(response({ ok: true, complete: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    const second = renderWithProviders(loader(), { locale: 'en' });
    second.unmount();
    rejectRequest(new Error('late'));
    await Promise.resolve();
    expect(screen.queryByText('late')).toBeNull();
  });

  it('stops rendering and does not repeat hydration when disabled after a rerender', async () => {
    let resolveRequest: (value: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    const view = renderWithProviders(loader(), { locale: 'en' });
    view.rerender(loader(false));
    resolveRequest(response({ ok: true, complete: true }));
    await Promise.resolve();
    expect(screen.queryByRole('status')).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
