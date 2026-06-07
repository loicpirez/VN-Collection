// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DownloadAssetsButton } from '@/components/DownloadAssetsButton';

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

describe('DownloadAssetsButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders two buttons in the default complete state', () => {
    renderWithProviders(<DownloadAssetsButton vnId="v90001" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Download missing' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Full re-download' })).not.toBeNull();
  });

  it('collapses to a single CTA when dataState is "none"', () => {
    renderWithProviders(<DownloadAssetsButton vnId="v90002" dataState="none" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Download data' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Full re-download' })).toBeNull();
  });

  it('shows the "Update data" primary label for the partial state', () => {
    renderWithProviders(<DownloadAssetsButton vnId="v90003" dataState="partial" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Update data' })).not.toBeNull();
  });

  it('posts without ?refresh=true for the missing flow and shows the success status', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90004" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90004/assets');
    expect(init.method).toBe('POST');
    expect(await screen.findByText('Missing data fetched.')).not.toBeNull();
  });

  it('posts with ?refresh=true for the full flow and shows the full success status', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90005" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Full re-download' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/collection/v90005/assets?refresh=true');
    expect(await screen.findByText('Everything re-downloaded.')).not.toBeNull();
  });

  it('renders the EGS warning chip when the response carries one', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: true, egs_warning: { kind: 'throttled', status: 429 } }));
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90006" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    expect(await screen.findByText('EGS rate-limited - wait a bit')).not.toBeNull();
    expect(await screen.findByText('(429)')).not.toBeNull();
  });

  it('shows the server error when the body carries an error on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: false, error: 'assets exploded' }, 500));
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90007" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    expect(await screen.findByText('assets exploded')).not.toBeNull();
  });

  it('falls back to the generic error label when ok is false without an error', async () => {
    // decodeAssetDownloadResult returns null for {ok:false} with no error,
    // so the component throws t.assets.downloadError.
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: false }, 200));
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90008" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    expect(await screen.findByText('Download failed')).not.toBeNull();
  });

  it('falls back to the generic error label when the response JSON is invalid', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }));
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90016" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    expect(await screen.findByText('Download failed')).not.toBeNull();
  });

  it('falls back to the generic error label when a non-ok response has no decoded error', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ broken: true }, 500));
    const { user } = renderWithProviders(<DownloadAssetsButton vnId="v90010" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    expect(await screen.findByText('Download failed')).not.toBeNull();
  });

  it('ignores duplicate clicks while one mutation is in flight', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    renderWithProviders(<DownloadAssetsButton vnId="v90011" />, { locale: 'en' });

    const button = screen.getByRole('button', { name: 'Download missing' });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ ok: true }));
    expect(await screen.findByText('Missing data fetched.')).not.toBeNull();
  });

  it('ignores stale success and failure completions after the VN changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { rerender, user } = renderWithProviders(<DownloadAssetsButton vnId="v90012" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    rerender(<DownloadAssetsButton vnId="v90013" />);
    resolveFetch(okJson({ ok: true }));
    await Promise.resolve();
    await Promise.resolve();
    await waitFor(() => expect(screen.queryByText('Missing data fetched.')).toBeNull());

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    rerender(<DownloadAssetsButton vnId="v90014" />);
    await user.click(screen.getByRole('button', { name: 'Download missing' }));
    rerender(<DownloadAssetsButton vnId="v90015" />);
    rejectFetch(new Error('stale failure'));
    await Promise.resolve();
    await Promise.resolve();
    await waitFor(() => expect(screen.queryByText('stale failure')).toBeNull());
  });

  it('renders full-width menu rows in the menu variant', () => {
    const { container } = renderWithProviders(
      <DownloadAssetsButton vnId="v90009" variant="menu" />,
      { locale: 'en' },
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex-col');
    const missing = screen.getByRole('button', { name: 'Download missing' });
    expect(missing.className).toContain('w-full');
  });
});
