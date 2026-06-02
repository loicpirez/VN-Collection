// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
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

const t = dictionaries.fr;

const screenshots: Screenshot[] = [
  { url: 'https://example.com/sc1.jpg', thumbnail: 'https://example.com/sc1t.jpg', sexual: 0, dims: [1920, 1080] },
  { url: 'https://example.com/sc2.jpg', thumbnail: 'https://example.com/sc2t.jpg', sexual: 0 },
];
const releaseImages: ReleaseImage[] = [
  { release_id: 'r90001', release_title: 'Release X', type: 'pkgfront', url: 'https://example.com/pkg.jpg', thumbnail: 'https://example.com/pkgt.jpg', sexual: 0 },
];

function renderGallery(extra: Partial<React.ComponentProps<typeof MediaGallery>> = {}) {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <MediaGallery vnId="v90001" screenshots={screenshots} releaseImages={releaseImages} {...extra} />
    </DisplaySettingsProvider>,
  );
}

describe('MediaGallery', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null (renders nothing) when there are no media at all', () => {
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <MediaGallery vnId="v90001" screenshots={[]} releaseImages={[]} />
      </DisplaySettingsProvider>,
    );
    expect(container.querySelector('[aria-label]')).toBeNull();
  });

  it('renders filter chips with counts and a tile list', () => {
    renderGallery();
    const filters = screen.getByRole('group', { name: t.media.filtersLabel });
    expect(within(filters).getByRole('button', { name: new RegExp(t.media.all) })).toBeTruthy();
    expect(within(filters).getByRole('button', { name: new RegExp(t.media.screenshots) })).toBeTruthy();
    expect(screen.getByRole('list', { name: t.media.itemsLabel })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: t.media.actionsMenu }).length).toBe(3);
  });

  it('filters down to one group when a chip is selected', () => {
    renderGallery();
    const filters = screen.getByRole('group', { name: t.media.filtersLabel });
    fireEvent.click(within(filters).getByRole('button', { name: new RegExp(t.media.pkgfront) }));
    // Only the single pkgfront tile remains -> a single kebab.
    expect(screen.getAllByRole('button', { name: t.media.actionsMenu }).length).toBe(1);
  });

  it('opens the lightbox, navigates next, and closes it', async () => {
    renderGallery();
    const tileActivators = screen.getAllByRole('button', { name: new RegExp(t.media.openLightbox) });
    fireEvent.click(tileActivators[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    // Counter shows "1 / 3".
    expect(within(dialog).getByText(/1 \/ 3/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.next }));
    await waitFor(() => expect(within(dialog).getByText(/2 \/ 3/)).toBeTruthy());
    fireEvent.click(within(dialog).getAllByRole('button', { name: t.common.close })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opens the kebab menu and POSTs Set as cover', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderGallery();
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setCover = await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.click(setCover);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST');
    expect(JSON.parse(call![1].body)).toMatchObject({ source: 'path' });
  });

  it('POSTs Set as banner from the kebab menu', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderGallery();
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setBanner = await screen.findByRole('menuitem', { name: t.media.setAsBanner });
    fireEvent.click(setBanner);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'POST')).toBe(true));
  });

  it('rotates the tile preview and exposes a reset entry plus a preview-only note', async () => {
    renderGallery();
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    await screen.findByRole('menuitem', { name: t.media.setAsCover });
    // No reset entry until rotated.
    expect(screen.queryByRole('menuitem', { name: t.coverActions.resetRotation })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: t.coverActions.rotateRight }));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: t.coverActions.resetRotation })).toBeTruthy());
    expect(screen.getByText(t.media.rotationPreviewOnly)).toBeTruthy();
  });

  it('surfaces an error toast when the cover POST fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'gallery cover failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderGallery();
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const setCover = await screen.findByRole('menuitem', { name: t.media.setAsCover });
    fireEvent.click(setCover);
    await waitFor(() => expect(screen.getByText('gallery cover failed')).toBeTruthy());
  });

  it('renders an Open original link to the source URL in the kebab', async () => {
    renderGallery();
    // In the "all" view release images sort before screenshots, so the
    // first tile is the pkgfront release image.
    fireEvent.click(screen.getAllByRole('button', { name: t.media.actionsMenu })[0]);
    const original = await screen.findByRole('menuitem', { name: t.media.openOriginal });
    expect(original.getAttribute('href')).toBe('https://example.com/pkg.jpg');
    expect(original.getAttribute('target')).toBe('_blank');
  });
});
