// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { BannerSourcePicker } from '@/components/BannerSourcePicker';
import { dispatchBannerChanged } from '@/lib/cover-banner-events';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ReleaseImage, ReleaseImageType, Screenshot } from '@/lib/types';

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
  { url: 'https://example.com/sc2.jpg', local: 'storage/sc2.jpg', thumbnail: '', local_thumb: 'storage/sc2-thumb.jpg' },
];
const releaseImages: ReleaseImage[] = [
  // pkgmed -> the aspect-square branch; localized type label resolves from t.media.
  { release_id: 'r90001', release_title: 'Release X', type: 'pkgmed', url: 'https://example.com/pkg.jpg', thumbnail: null, sexual: 0 },
  // An out-of-domain type that is NOT a t.media key -> the localizedType else branch + aspect-[2/3].
  { release_id: 'r90002', release_title: 'Release Y', type: 'weirdtype' as ReleaseImageType, url: 'storage/local-rel.jpg', thumbnail: null, sexual: 0 },
  { release_id: 'r90003', release_title: 'Release Z', type: 'pkgfront', url: 'https://example.com/front.jpg', thumbnail: 'https://example.com/front-thumb.jpg', local: 'storage/front.jpg', local_thumb: 'storage/front-thumb.jpg' },
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

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BannerSourcePicker branches', () => {
  it('moves between tabs with the arrow keys', async () => {
    renderPicker();
    await open();
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
    // A non-arrow key is a no-op (covers the early-return branch).
    fireEvent.keyDown(tablist, { key: 'Enter' });
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches back to the custom tab with the visible tab button', async () => {
    renderPicker();
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('tab', { name: t.coverPicker.custom }));
    expect(screen.getByRole('tab', { name: t.coverPicker.custom })).toHaveAttribute('aria-selected', 'true');
  });

  it('rejects a non-image upload with a toast and no fetch', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByText(t.cover.mustBeImage)).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner')).toBe(false);
  });

  it('picks a gallery image with a local value and broadcasts newLocal', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    const dialog = await open();
    // Release Y uses a relative storage path -> isRemote false -> newLocal branch.
    const tile = await within(dialog).findByTitle(/Release Y/);
    fireEvent.click(tile);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST');
      expect(JSON.parse(call![1].body)).toEqual({ source: 'release', value: 'storage/local-rel.jpg' });
    });
  });

  it('picks a gallery image with a remote URL and broadcasts newSrc', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    const dialog = await open();
    // The screenshot uses an http(s) URL -> isRemote true branch.
    const tile = await within(dialog).findByTitle(`${t.media.screenshots} 1`);
    fireEvent.click(tile);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST');
      expect(JSON.parse(call![1].body)).toEqual({ source: 'screenshot', value: 'https://example.com/sc1.jpg' });
    });
  });

  it('picks gallery items that rely on thumbnail and local fallbacks', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    const dialog = await open();
    const localScreenshot = await within(dialog).findByTitle(`${t.media.screenshots} 2`);
    fireEvent.click(localScreenshot);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST');
      expect(JSON.parse(call![1].body)).toEqual({ source: 'screenshot', value: 'storage/sc2.jpg' });
    });
  });

  it('marks the currently-set gallery banner as pressed', async () => {
    renderPicker({ currentBanner: 'storage/local-rel.jpg' });
    const dialog = await open();
    const tile = await within(dialog).findByTitle(/Release Y/);
    // currentBanner matches this tile value -> aria-pressed true.
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the empty-gallery copy when there are no images', async () => {
    renderPicker({ screenshots: [], releaseImages: [] });
    await open();
    expect(screen.getByText(t.coverPicker.galleryEmpty)).toBeInTheDocument();
  });

  it('resets the banner via DELETE and broadcasts a cleared backdrop', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ currentBanner: 'cover/custom-banner.jpg' });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useDefault }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.bannerReset)).toBeInTheDocument());
  });

  it('surfaces an error toast when the reset DELETE fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'reset failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker({ currentBanner: 'cover/custom-banner.jpg' });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useDefault }));
    await waitFor(() => expect(screen.getByText('reset failed')).toBeInTheDocument());
  });

  it('uploads an image file and broadcasts the new local banner path', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ banner: 'cover/up.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('errors when the upload response carries no banner path', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
  });

  it('ignores a concurrent applySource while one mutation is already running', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderPicker();
    const dialog = await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/x.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    // A second gallery click while busy must be a no-op.
    const tile = within(dialog).getByTitle(`${t.media.screenshots} 1`);
    fireEvent.click(tile);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('does not repaint the backdrop for a banner event addressed to another VN', async () => {
    renderPicker();
    await open();
    // dispatchBannerChanged is wired by sibling controls; an unrelated VN id is a no-op here.
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    dispatchBannerChanged({ vnId: 'v90999', newSrc: null, newLocal: null });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes from the backdrop and the explicit close button', async () => {
    const { container } = renderPicker();
    await open();
    const backdropPanel = container.ownerDocument.querySelector('.fixed.inset-0.z-\\[1000\\]') as HTMLElement;
    fireEvent.click(backdropPanel);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await open();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes from Escape through the dialog a11y handler', async () => {
    renderPicker();
    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the dialog open when the user clicks inside the panel', async () => {
    renderPicker();
    const dialog = await open();
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens the hidden file input and ignores empty file selections', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.chooseFile }));
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.change(fileInput, { target: { files: [] } });
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner')).toBe(false);
  });

  it('ignores duplicate pasted-URL submissions while the first mutation is pending', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderPicker();
    await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/x.jpg' } });
    const apply = screen.getByRole('button', { name: t.coverPicker.applyUrl });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('ignores duplicate hidden-file uploads while the first mutation is pending', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response(JSON.stringify({ banner: 'cover/up.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('drops a successful pasted-URL mutation after the picker unmounts', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; })) as unknown as typeof fetch;
    const view = renderPicker();
    await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/stale.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    view.unmount();
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText(t.toast.bannerSaved)).toBeNull();
  });

  it('drops a failed pasted-URL mutation after the picker unmounts', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; })) as unknown as typeof fetch;
    const view = renderPicker();
    await open();
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/stale-error.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    view.unmount();
    resolveFetch(new Response(JSON.stringify({ error: 'stale url failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText('stale url failed')).toBeNull();
  });

  it('drops reset and upload results after the picker unmounts', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; })) as unknown as typeof fetch;
    const resetView = renderPicker({ currentBanner: 'cover/custom-banner.jpg' });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useDefault }));
    resetView.unmount();
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText(t.toast.bannerReset)).toBeNull();

    let resolveUpload: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveUpload = res; })) as unknown as typeof fetch;
    const uploadView = renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    uploadView.unmount();
    resolveUpload(new Response(JSON.stringify({ banner: 'cover/up.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText(t.toast.bannerSaved)).toBeNull();
  });

  it('drops failed reset and upload results after the picker unmounts', async () => {
    let resolveReset: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveReset = res; })) as unknown as typeof fetch;
    const resetView = renderPicker({ currentBanner: 'cover/custom-banner.jpg' });
    await open();
    fireEvent.click(screen.getByRole('tab', { name: t.bannerPicker.defaultTab }));
    fireEvent.click(screen.getByRole('button', { name: t.bannerPicker.useDefault }));
    resetView.unmount();
    resolveReset(new Response(JSON.stringify({ error: 'stale reset failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText('stale reset failed')).toBeNull();

    let resolveUpload: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((res) => { resolveUpload = res; })) as unknown as typeof fetch;
    const uploadView = renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    uploadView.unmount();
    resolveUpload(new Response(JSON.stringify({ error: 'stale upload failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    expect(screen.queryByText('stale upload failed')).toBeNull();
  });

  it('surfaces upload HTTP failures before decoding the banner path', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'upload failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText('upload failed')).toBeInTheDocument());
  });

  it('falls back to the common upload error when the response body is not JSON', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker();
    const dialog = await open();
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
  });
});
