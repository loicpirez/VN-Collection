// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { RefreshScopeButton } from '@/components/RefreshScopeButton';

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

/**
 * RefreshScopeButton schedules a 30s `setInterval` for the freshness chip,
 * so the suite runs on fake timers. userEvent's internal delay clashes with
 * fake timers, so these tests drive clicks with the synchronous fireEvent.
 */
describe('RefreshScopeButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: true, deleted: 3, patterns: [], scope: 'tagsList' }));
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses scope-specific labels when the scope is registered', () => {
    renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Refresh tags' });
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('title')).toBe('Bust the tag-index cache only (search results + tag detail rows)');
    expect(btn.getAttribute('data-refresh-scope')).toBe('tagsList');
  });

  it('falls back to the generic refresh labels for an unregistered scope', () => {
    renderWithProviders(<RefreshScopeButton scope="not_a_real_scope" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Refresh' });
    expect(btn.getAttribute('title')).toBe(
      'Re-download the global data this page depends on (EGS, VNDB, releases, ...)',
    );
  });

  it('hides the freshness chip when lastUpdatedAt is undefined', () => {
    renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    expect(screen.queryByText('Data')).toBeNull();
  });

  it('renders the freshness chip when lastUpdatedAt is provided', () => {
    renderWithProviders(<RefreshScopeButton scope="tagsList" lastUpdatedAt={Date.now()} />, { locale: 'en' });
    expect(screen.getByText('Data')).not.toBeNull();
  });

  it('renders a stale freshness chip when lastUpdatedAt is null', () => {
    const { container } = renderWithProviders(
      <RefreshScopeButton scope="tagsList" lastUpdatedAt={null} />,
      { locale: 'en' },
    );
    expect(screen.getByText('Data')).not.toBeNull();
    expect(container.querySelector('.lucide-clock')).not.toBeNull();
  });

  it('POSTs the scope + params and shows a success toast', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <RefreshScopeButton scope="tagDetail" params={{ gid: 'g73' }} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh this tag' }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/refresh/scope');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ scope: 'tagDetail', params: { gid: 'g73' } });
    await vi.waitFor(() => expect(screen.queryByText('Global data refreshed.')).not.toBeNull());
  });

  it('serializes an empty params object when none are supplied', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh tags' }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ scope: 'tagsList', params: {} });
  });

  it('shows an error toast when the response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ error: 'bad scope param' }, 400));
    renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh tags' }));
    await vi.waitFor(() => expect(screen.queryByText('bad scope param')).not.toBeNull());
  });

  it('disables the button while in flight and ignores re-entrant clicks', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Refresh tags' });
    fireEvent.click(btn);
    await vi.waitFor(() => expect(btn.hasAttribute('disabled')).toBe(true));
    expect(container.querySelector('.lucide-loader-circle')).not.toBeNull();
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ ok: true, deleted: 0, patterns: [], scope: 'tagsList' }));
    await vi.waitFor(() => expect(btn.hasAttribute('disabled')).toBe(false));
  });

  it('ignores same-frame duplicate refresh clicks', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<RefreshScopeButton scope="tagsList" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Refresh tags' });
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ ok: true, deleted: 0, patterns: [], scope: 'tagsList' }));
    await vi.waitFor(() => expect(screen.queryByText('Global data refreshed.')).not.toBeNull());
  });

  it('suppresses stale success and failure completions after the scope identity changes', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const { rerender } = renderWithProviders(<RefreshScopeButton scope="tagDetail" params={{ gid: 'g73' }} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh this tag' }));
    rerender(<RefreshScopeButton scope="tagDetail" params={{ gid: 'g74' }} />);
    resolveFetch(okJson({ ok: true, deleted: 0, patterns: [], scope: 'tagDetail' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Global data refreshed.')).toBeNull();

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }),
    );
    rerender(<RefreshScopeButton scope="tagDetail" params={{ gid: 'g75' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh this tag' }));
    rerender(<RefreshScopeButton scope="tagDetail" params={{ gid: 'g76' }} />);
    rejectFetch(new Error('stale refresh error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('stale refresh error')).toBeNull();
  });

  it('keeps the chip rendered after the 30s interval tick fires', async () => {
    renderWithProviders(<RefreshScopeButton scope="tagsList" lastUpdatedAt={Date.now()} />, { locale: 'en' });
    expect(screen.getByText('Data')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(screen.getByText('Data')).not.toBeNull();
  });
});
