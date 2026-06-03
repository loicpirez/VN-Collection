// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
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

const t = dictionaries.en;

function okResponse() {
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}

function errorResponse(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
}

function bannerFile() {
  return new File(['bytes'], 'banner.png', { type: 'image/png' });
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('BannerControls branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the inline variant with upload and reset when a custom banner exists', () => {
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner variant="inline" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: new RegExp(t.banner.uploadCta) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(t.banner.reset) })).toBeInTheDocument();
  });

  it('uploads via the inline variant and shows the banner-saved toast', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} variant="inline" />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [bannerFile()] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('resets the banner via DELETE in the inline variant and shows the reset toast', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner variant="inline" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.bannerReset)).toBeInTheDocument());
  });

  it('does nothing when the file change carries no file', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the card-variant error alert when the reset DELETE fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('card reset boom'));
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('card reset boom');
  });
});
