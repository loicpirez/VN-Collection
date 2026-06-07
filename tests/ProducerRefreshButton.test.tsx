// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ProducerRefreshButton } from '@/components/ProducerRefreshButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('ProducerRefreshButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ developers: 5, publishers: 2, owned: 1, stale: false }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the idle Refresh label + refresh icon', () => {
    const { container } = renderWithProviders(<ProducerRefreshButton producerId="p90001" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeNull();
    expect(container.querySelector('.lucide-refresh-cw')).not.toBeNull();
  });

  it('POSTs to the producer refresh endpoint and shows a success toast on fresh data', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<ProducerRefreshButton producerId="p90002" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/producer/p90002/refresh');
    expect(init.method).toBe('POST');
    // refreshDone: 'Updated / {devs} dev / {pubs} pub / {owned} owned'
    expect(await screen.findByText('Updated / 5 dev / 2 pub / 1 owned')).not.toBeNull();
    // No stale suffix on a fresh refresh.
    expect(screen.queryByText(/cache served/)).toBeNull();
  });

  it('appends the stale suffix (warning toast) when the payload is stale', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ developers: 3, publishers: 1, owned: 0, stale: true }));
    const { user } = renderWithProviders(<ProducerRefreshButton producerId="p90003" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/data may be stale - VNDB unreachable, cache served\./)).not.toBeNull();
  });

  it('errors when the decoder rejects the body (missing counters)', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ developers: 3 }));
    const { user } = renderWithProviders(<ProducerRefreshButton producerId="p90004" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Error')).not.toBeNull();
  });

  it('surfaces the server error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ error: 'refresh failed upstream' }, 502));
    const { user } = renderWithProviders(<ProducerRefreshButton producerId="p90005" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('refresh failed upstream')).not.toBeNull();
  });

  it('switches to the Refreshing label + spinner while in flight and ignores re-entrant clicks', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container, user } = renderWithProviders(<ProducerRefreshButton producerId="p90006" />, { locale: 'en' });
    const btn = screen.getByRole('button');
    await user.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refreshing...' })).not.toBeNull());
    expect(container.querySelector('.lucide-loader-circle')).not.toBeNull();
    await user.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ developers: 1, publishers: 1, owned: 1, stale: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeNull());
  });

  it('ignores same-frame duplicate refresh clicks', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<ProducerRefreshButton producerId="p90007" />, { locale: 'en' });
    const button = screen.getByRole('button', { name: 'Refresh' });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ developers: 1, publishers: 1, owned: 1, stale: false }));
    expect(await screen.findByText('Updated / 1 dev / 1 pub / 1 owned')).not.toBeNull();
  });

  it('suppresses stale success and failure completions after the producer changes', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const { user, rerender } = renderWithProviders(<ProducerRefreshButton producerId="p90008" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    rerender(<ProducerRefreshButton producerId="p90009" />);
    resolveFetch(okJson({ developers: 1, publishers: 1, owned: 1, stale: false }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Updated / 1 dev / 1 pub / 1 owned')).toBeNull();

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }),
    );
    rerender(<ProducerRefreshButton producerId="p90010" />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    rerender(<ProducerRefreshButton producerId="p90011" />);
    rejectFetch(new Error('stale producer refresh'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('stale producer refresh')).toBeNull();
  });
});
