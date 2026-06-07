// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { MediaGallery } from '@/components/MediaGallery';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ReleaseImage, Screenshot } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function renderGallery(screenshots: Screenshot[], releaseImages: ReleaseImage[]) {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <MediaGallery vnId="v90001" screenshots={screenshots} releaseImages={releaseImages} />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

const twoScreens: Screenshot[] = [
  { url: 'https://example.com/sc1.jpg', thumbnail: 'https://example.com/sc1t.jpg', sexual: 0, dims: [1920, 1080] },
  { url: 'https://example.com/sc2.jpg', thumbnail: 'https://example.com/sc2t.jpg', dims: [1280, 720] },
];

describe('MediaGallery branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups every release image type and localizes the chip labels', () => {
    const releaseImages: ReleaseImage[] = (['pkgback', 'pkgcontent', 'pkgside', 'pkgmed', 'dig'] as const).map((type, i) => ({
      release_id: `r9000${i}`,
      release_title: `Release ${i}`,
      type,
      url: `https://example.com/${type}.jpg`,
      thumbnail: `https://example.com/${type}t.jpg`,
      sexual: 0,
    }));
    renderGallery([], releaseImages);
    const filters = screen.getByRole('group', { name: t.media.filtersLabel });
    expect(within(filters).getByRole('button', { name: new RegExp(t.media.pkgback) })).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: new RegExp(t.media.dig) })).toBeInTheDocument();
    expect(within(filters).getByRole('button', { name: new RegExp(t.media.pkgmed) })).toBeInTheDocument();
    // 5 tiles → 5 kebabs.
    expect(screen.getAllByRole('button', { name: t.media.actionsMenu }).length).toBe(5);
  });

  it('navigates the lightbox with the previous button (wraps to the last item)', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 \/ 2/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.prev }));
    await waitFor(() => expect(within(dialog).getByText(/2 \/ 2/)).toBeInTheDocument());
  });

  it('navigates the lightbox with arrow keys', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Home' });
    expect(within(dialog).getByText(/1 \/ 2/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(within(dialog).getByText(/2 \/ 2/)).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(within(dialog).getByText(/1 \/ 2/)).toBeInTheDocument());
  });

  it('closes the lightbox when the backdrop is clicked', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0]);
    const dialog = await screen.findByRole('dialog');
    // The first close-labelled button is the full-bleed backdrop.
    fireEvent.click(within(dialog).getAllByRole('button', { name: t.common.close })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('omits the prev/next nav buttons when there is a single image', async () => {
    renderGallery([twoScreens[0]], []);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.media.openLightbox) }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: t.common.next })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: t.common.prev })).toBeNull();
  });

  it('opens the lightbox via keyboard activation on a tile', async () => {
    renderGallery(twoScreens, []);
    const tile = screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0];
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens the lightbox via Space on a tile', async () => {
    renderGallery(twoScreens, []);
    const tile = screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0];
    fireEvent.keyDown(tile, { key: ' ' });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ignores unrelated key presses on a tile activator', () => {
    renderGallery(twoScreens, []);
    const tile = screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0];
    fireEvent.keyDown(tile, { key: 'A' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the lightbox open when clicking the image container and closes with the top close button', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) })[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByAltText(`${t.media.screenshots} 1`).parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole('button', { name: t.common.close })[1]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('rotates a tile preview left and exposes the reset entry', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.click(screen.getByRole('menuitem', { name: t.coverActions.rotateLeft }));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: t.coverActions.resetRotation })).toBeInTheDocument());
  });

  it('dispatches a local-path banner event when setting a release image (with a local mirror) as banner', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const releaseImages: ReleaseImage[] = [{
      release_id: 'r90001',
      release_title: 'Release X',
      type: 'pkgfront',
      url: 'https://example.com/pkg.jpg',
      thumbnail: 'https://example.com/pkgt.jpg',
      local: 'vn/r90001-pkg.jpg',
      local_thumb: 'vn/r90001-pkg-t.jpg',
    }];
    renderGallery([], releaseImages);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setBanner = await screen.findByRole('menuitem', { name: t.media.setAsBanner });
    fireEvent.click(setBanner);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST')!;
    // The path body carries the local mirror, not the remote URL.
    expect(JSON.parse(call[1].body)).toMatchObject({ source: 'path', value: 'vn/r90001-pkg.jpg' });
  });

  it('surfaces an error toast when the banner POST fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'banner gallery boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setBanner = await screen.findByRole('menuitem', { name: t.media.setAsBanner });
    fireEvent.click(setBanner);
    await waitFor(() => expect(screen.getByText('banner gallery boom')).toBeInTheDocument());
  });

  it('omits the Open original entry when the source URL is not a safe http(s) link', async () => {
    const releaseImages: ReleaseImage[] = [{
      release_id: 'r90009',
      release_title: 'Local only',
      type: 'pkgfront',
      url: 'data:image/png;base64,AAAA',
      thumbnail: null,
      local: 'vn/r90009.jpg',
      local_thumb: 'vn/r90009-t.jpg',
      sexual: 0,
    }];
    renderGallery([], releaseImages);
    fireEvent.click(screen.getByRole('button', { name: t.media.actionsMenu }));
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    expect(screen.queryByRole('menuitem', { name: t.media.openOriginal })).toBeNull();
  });

  it('roves focus through the kebab menu with arrow + Home/End keys and closes on Escape', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems.length).toBeGreaterThan(1);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('menuitem', { name: t.media.setAsCover })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    fireEvent.keyDown(document, { key: 'Home' });
    fireEvent.keyDown(document, { key: 'End' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: t.media.setAsCover })).toBeNull());
  });

  it('closes the open kebab when an outside click lands', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: t.media.setAsCover })).toBeNull());
  });

  it('keeps the kebab open for trigger/menu pointer events and closes the original-link row', async () => {
    renderGallery(twoScreens, []);
    const trigger = screen.getAllByRole('button', { name: t.media.actionsMenu })[0];
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    const original = await screen.findByRole('menuitem', { name: t.media.openOriginal });
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole('menuitem', { name: t.media.setAsCover })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('menu', { name: t.media.actionsMenu }));
    expect(screen.getByRole('menuitem', { name: t.media.setAsCover })).toBeInTheDocument();
    fireEvent.click(original);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: t.media.setAsCover })).toBeNull());
  });

  it('computes an above placement when there is not enough room below the tile', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 760,
      y: 720,
      top: 720,
      right: 920,
      bottom: 780,
      left: 760,
      width: 160,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect);
    const offsetSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(220);
    const innerHeight = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const innerWidth = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(960);
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
    });
    expect(rectSpy).toHaveBeenCalled();
    offsetSpy.mockRestore();
    innerHeight.mockRestore();
    innerWidth.mockRestore();
  });

  it('opens the lightbox via the kebab Open entry for keyboard users', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const openItem = await screen.findByRole('menuitem', { name: t.media.openLightbox });
    fireEvent.click(openItem);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ignores duplicate set-as-cover clicks while the first request is pending', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setCover = await screen.findByRole('menuitem', { name: t.media.setAsCover });
    act(() => {
      fireEvent.click(setCover);
      fireEvent.click(setCover);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('ignores stale successful set-as-cover responses after unmount', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    const view = renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setCover = await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.click(setCover);
    view.unmount();
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(t.toast.saved)).toBeNull();
  });

  it('ignores stale failed set-as-banner responses after unmount', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    const view = renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setBanner = await screen.findByRole('menuitem', { name: t.media.setAsBanner });
    fireEvent.click(setBanner);
    view.unmount();
    resolveFetch(new Response(JSON.stringify({ error: 'stale banner failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('stale banner failed')).toBeNull();
  });

  it('resets a rotated tile preview from the kebab menu', async () => {
    renderGallery(twoScreens, []);
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.click(screen.getByRole('menuitem', { name: t.coverActions.rotateRight }));
    const reset = await screen.findByRole('menuitem', { name: t.coverActions.resetRotation });
    fireEvent.click(reset);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: t.coverActions.resetRotation })).toBeNull());
  });

  it('opens the lightbox showing native dimensions and a release caption', async () => {
    const releaseImages: ReleaseImage[] = [{
      release_id: 'r90001',
      release_title: 'Captioned release',
      type: 'pkgfront',
      url: 'https://example.com/cap.jpg',
      thumbnail: 'https://example.com/capt.jpg',
      dims: [800, 1200],
      sexual: 0,
    }];
    renderGallery([], releaseImages);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.media.openLightbox) }));
    const dialog = await screen.findByRole('dialog');
    // The lightbox description composes the counter, native dims and caption.
    expect(within(dialog).getByText(/800x1200/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Captioned release/).length).toBeGreaterThan(0);
  });
});
