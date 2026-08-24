// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { TagRemoteLoader } from '@/components/TagRemoteLoader';
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

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks.router,
}));

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  navigationMocks.refresh.mockReset();
  vi.restoreAllMocks();
});

describe('TagRemoteLoader', () => {
  it('does not request or render when every snapshot is fresh', async () => {
    global.fetch = vi.fn();
    renderWithProviders(
      <TagRemoteLoader enabled={false} tagId="g90001" page={1} mode="local" />,
      { locale: 'en' },
    );
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hydrates the requested page and refreshes the server snapshot', async () => {
    global.fetch = vi.fn().mockResolvedValue(response({ complete: true }));
    renderWithProviders(
      <TagRemoteLoader enabled tagId="g90001" page={3} mode="vndb" />,
      { locale: 'en' },
    );
    expect(screen.getByRole('status').textContent).toContain('Loading');
    await vi.waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/tags/g90001/hydrate?page=3&mode=vndb',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a retry for partial hydration and succeeds on the next attempt', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ complete: false }))
      .mockResolvedValueOnce(response({ complete: true }));
    renderWithProviders(
      <TagRemoteLoader enabled tagId="g90002" page={1} mode="local" />,
      { locale: 'en' },
    );
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('alert').textContent).toContain('Some VNDB details could not be refreshed');
    fireEvent.click(retry);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('surfaces sanitized API errors and retries', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ error: 'Provider unavailable' }, 502))
      .mockResolvedValueOnce(response({ complete: true }));
    renderWithProviders(
      <TagRemoteLoader enabled tagId="g90003" page={1} mode="vndb" />,
      { locale: 'en' },
    );
    expect((await screen.findByRole('alert')).textContent).toContain('This tag’s VNDB data could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('uses the generic message for malformed and empty failures', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockRejectedValueOnce(new Error(''));
    const view = renderWithProviders(
      <TagRemoteLoader enabled tagId="g90004" page={1} mode="vndb" />,
      { locale: 'en' },
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Some VNDB details could not be refreshed');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toContain('This tag’s VNDB data could not be loaded'));
    view.unmount();
  });

  it('ignores a rejected request after unmount aborts it', async () => {
    let rejectRequest: (error: Error) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    }));
    const view = renderWithProviders(
      <TagRemoteLoader enabled tagId="g90005" page={1} mode="local" />,
      { locale: 'en' },
    );
    view.unmount();
    rejectRequest(new Error('late failure'));
    await Promise.resolve();
    expect(screen.queryByText('late failure')).toBeNull();
  });

  it('ignores a successful request after unmount aborts it', async () => {
    let resolveRequest: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    const view = renderWithProviders(
      <TagRemoteLoader enabled tagId="g90006" page={1} mode="vndb" />,
      { locale: 'en' },
    );
    view.unmount();
    resolveRequest(response({ complete: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });
});
