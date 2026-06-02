// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { BannerSourcePicker } from '@/components/BannerSourcePicker';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ReleaseImage, Screenshot } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

const screenshots: Screenshot[] = [
  { url: 'https://example.com/sc1.jpg', thumbnail: 'https://example.com/sc1t.jpg', sexual: 0 },
];
const releaseImages: ReleaseImage[] = [
  { release_id: 'r90001', release_title: 'Release X', type: 'pkgmed', url: 'https://example.com/pkg.jpg', thumbnail: null, sexual: 0 },
];

function renderPicker(extra: Partial<React.ComponentProps<typeof BannerSourcePicker>> = {}) {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <BannerSourcePicker
        vnId="v90001"
        currentBanner={null}
        coverRemote="https://example.com/cover.jpg"
        coverLocal={null}
        coverSexual={0}
        screenshots={screenshots}
        releaseImages={releaseImages}
        {...extra}
      />
    </DisplaySettingsProvider>,
  );
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t.bannerPicker.open) }));
  return screen.findByRole('dialog');
}

describe('BannerSourcePicker', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the dialog on the custom tab', async () => {
    renderPicker();
    const dialog = await open();
    expect(dialog).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
  });

  it('applies a pasted URL via POST', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/banner.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST');
    expect(JSON.parse(call![1].body)).toEqual({ source: 'url', value: 'https://example.com/banner.jpg' });
  });

  it('uses the cover as banner from the default tab', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useCover }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST');
    expect(JSON.parse(call![1].body)).toEqual({ source: 'cover' });
  });

  it('disables the reset button and shows the hint when no custom banner is set', async () => {
    renderPicker({ currentBanner: null });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    expect((screen.getByRole('button', { name: t.bannerPicker.useDefault }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t.bannerPicker.alreadyDefault)).toBeTruthy();
  });

  it('resets the banner via DELETE when a custom banner is set', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ currentBanner: 'cover/custom-banner.jpg' });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useDefault }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'DELETE')).toBe(true));
  });

  it('uploads a file via POST FormData', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ banner: 'cover/b.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.body instanceof FormData)).toBe(true));
  });

  it('surfaces an error toast when the banner POST fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'banner pick failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker();
    await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/x.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    await waitFor(() => expect(screen.getByText('banner pick failed')).toBeTruthy());
  });
});
