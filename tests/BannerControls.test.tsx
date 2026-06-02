// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BannerControls } from '@/components/BannerControls';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function bannerFile() {
  return new File(['bytes'], 'banner.png', { type: 'image/png' });
}

describe('BannerControls', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the card variant with title + hint and no reset button without a custom banner', () => {
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />);
    expect(screen.getByText(t.banner.title)).toBeTruthy();
    expect(screen.getByText(t.banner.hint)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.banner.reset) })).toBeNull();
  });

  it('uploads a banner via POST FormData', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bannerFile()] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/banner');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('resets the banner via DELETE when hasCustomBanner', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/banner');
    expect(init.method).toBe('DELETE');
  });

  it('renders inline variant and surfaces an error alert when the upload fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'banner failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner variant="inline" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bannerFile()] } });
    // ErrorAlert renders a div[role="alert"] inside the component container;
    // the toast renders a separate alert in a body-level portal.
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('banner failed');
  });
});
