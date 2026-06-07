// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SetBannerButton } from '@/components/SetBannerButton';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

describe('SetBannerButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders with the "set as" label by default', () => {
    renderWithProviders(<SetBannerButton vnId="v90001" value="cover/v1.jpg" />);
    expect(screen.getByRole('button').textContent).toContain(t.banner.setAs);
  });

  it('POSTs the banner with source+value and flips to the "set" label, then back after the timer', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<SetBannerButton vnId="v90001" value="cover/v1.jpg" source="cover" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/banner');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ source: 'cover', value: 'cover/v1.jpg' });
    expect(screen.getByRole('button').textContent).toContain(t.banner.set);
    // The done state reverts after the 1500ms timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(screen.getByRole('button').textContent).toContain(t.banner.setAs);
  });

  it('clears an existing done timer when setting another banner', async () => {
    renderWithProviders(<SetBannerButton vnId="v90001" value="cover/v1.jpg" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears an existing done timer when the VN changes', async () => {
    const { rerender } = renderWithProviders(<SetBannerButton vnId="v90007" value="cover/v7.jpg" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender(<SetBannerButton vnId="v90008" value="cover/v8.jpg" />);
    expect(screen.getByRole('button').textContent).toContain(t.banner.setAs);
  });

  it('ignores same-frame duplicate set clicks while the request is pending', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    renderWithProviders(<SetBannerButton vnId="v90002" value="cover/v2.jpg" />);
    const button = screen.getByRole('button');
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('puts the error message on the button title when the request fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'set banner failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(<SetBannerButton vnId="v90001" value="cover/v1.jpg" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button').getAttribute('title')).toBe('set banner failed');
  });

  it('suppresses stale success and failure completions after the VN changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { rerender } = renderWithProviders(<SetBannerButton vnId="v90003" value="cover/v3.jpg" />);
    fireEvent.click(screen.getByRole('button'));
    rerender(<SetBannerButton vnId="v90004" value="cover/v4.jpg" />);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button').textContent).toContain(t.banner.setAs);

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    rerender(<SetBannerButton vnId="v90005" value="cover/v5.jpg" />);
    fireEvent.click(screen.getByRole('button'));
    rerender(<SetBannerButton vnId="v90006" value="cover/v6.jpg" />);
    rejectFetch(new Error('stale banner error'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button').getAttribute('title')).toBe(t.banner.setAs);
  });
});
