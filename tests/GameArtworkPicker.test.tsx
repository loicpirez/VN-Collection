// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerSourcePicker } from '@/components/BannerSourcePicker';
import { CoverSourcePicker } from '@/components/CoverSourcePicker';
import { GameArtworkPicker } from '@/components/GameArtworkPicker';
import type { GameArtworkImage } from '@/lib/game-artwork';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, localSrc, alt, sexual }: { src?: string; localSrc?: string; alt: string; sexual?: number }) =>
    <img src={src || `/api/files/${localSrc}`} alt={alt} data-sexual={sexual} />,
}));

const t = dictionaries.fr;
const targetId = 'v90001';
const sourceId = 'v90002';
const sourceTitle = 'Source game';
const artworkUrl = '/api/vn/v90002/artwork';
const cover: GameArtworkImage = {
  kind: 'cover', value: 'cover/v90002-upload.jpg', remote: null, local: 'cover/v90002-upload.jpg',
  thumbnail: null, localThumbnail: null, sexual: null, releaseType: null, label: null,
};
const screenshot: GameArtworkImage = {
  ...cover, kind: 'screenshot', value: 'https://s2.vndb.org/sf/01/90002.jpg',
  remote: 'https://s2.vndb.org/sf/01/90002.jpg', thumbnail: 'https://s2.vndb.org/st/01/90002.jpg',
  local: 'vn-sc/v90002.jpg', localThumbnail: 'vn-sc/v90002-thumb.jpg', sexual: 1.8,
};
const release: GameArtworkImage = {
  ...screenshot, kind: 'release', value: 'https://s2.vndb.org/rf/01/90002.jpg',
  releaseType: 'pkgfront', label: 'Release X',
};

function row(id: string, title: string) {
  return { id, title, image_url: null, image_thumb: null, local_image: null, local_image_thumb: null };
}

function installFetch(loadArtwork: () => Response | Promise<Response>) {
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (path.startsWith('/api/collection/find?')) {
      return Response.json({ matches: [row(targetId, 'Target game'), row(sourceId, sourceTitle)] });
    }
    if (path.startsWith('/api/search?')) return Response.json({ results: [] });
    if (path === artworkUrl) return loadArtwork();
    if (init?.method === 'POST' || init?.method === 'PATCH') return Response.json({});
    throw new Error(`Unexpected URL: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

async function selectGame() {
  fireEvent.change(screen.getByRole('textbox', { name: t.gameArtwork.search }), { target: { value: 'source' } });
  const match = await screen.findByRole('button', { name: new RegExp(sourceTitle) });
  expect(screen.queryByRole('button', { name: /Target game/ })).toBeNull();
  fireEvent.click(match);
}

function Picker({ target, saved = null }: { target: 'cover' | 'banner'; saved?: string | null }) {
  const props = { vnId: targetId, screenshots: [], releaseImages: [], initialOpen: true };
  if (target === 'cover') {
    return <CoverSourcePicker {...props} vndbImage={null} egsId={null} egsHasImage={false} currentCustomCover={saved} currentImageSource="vndb" />;
  }
  return <BannerSourcePicker {...props} currentBanner={saved} coverRemote={null} coverLocal={null} coverSexual={null} />;
}

describe('artwork from another game', () => {
  beforeEach(() => refresh.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it.each(['cover', 'banner'] as const)('previews and applies only to the destination %s', async (target) => {
    const fetcher = installFetch(() => Response.json({ images: [cover, screenshot, release], releaseUnavailable: false }));
    const view = renderWithProviders(<Picker target={target} />);
    fireEvent.click(screen.getByRole('tab', { name: t.gameArtwork.tab }));
    await selectGame();
    const filter = await screen.findByRole('group', { name: t.gameArtwork.filter });
    fireEvent.click(within(filter).getByRole('button', { name: /Capture/ }));
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.screenshot }));
    expect(screen.getByAltText(t.gameArtwork.screenshot)).toHaveAttribute('src', screenshot.remote);
    expect(screen.getByAltText(t.gameArtwork.screenshot)).toHaveAttribute('data-sexual', '1.8');
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: target === 'cover' ? t.media.setAsCover : t.media.setAsBanner }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe(`/api/collection/${targetId}/${target}`);
    expect(writes[0][1]?.body).toBe(JSON.stringify({ source: 'path', value: screenshot.value }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<Picker target={target} saved={screenshot.value} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('preserves the search, shows more images, and returns from preview without applying', async () => {
    const fetcher = installFetch(() => Response.json({
      images: [cover, release, ...Array.from({ length: 19 }, (_, index) => ({ ...screenshot, value: `https://s2.vndb.org/sf/01/${index}.jpg` }))],
      releaseUnavailable: false,
    }));
    const apply = vi.fn();
    renderWithProviders(<GameArtworkPicker targetId={targetId} target="cover" busy={false} onApply={apply} />);
    await selectGame();
    expect(await screen.findByRole('button', { name: t.gameArtwork.more })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(18);
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.more }));
    expect(screen.getAllByRole('listitem')).toHaveLength(21);
    fireEvent.click(screen.getByRole('button', { name: /Release X/ }));
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.backToImages }));
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.backToSearch }));
    expect(screen.getByRole('textbox', { name: t.gameArtwork.search })).toHaveValue('source');
    expect(screen.getByRole('button', { name: /Source game/ })).toBeInTheDocument();
    expect(fetcher.mock.calls.filter(([path]) => path === artworkUrl)).toHaveLength(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('aborts browsing on return, handles errors and offers a retry', async () => {
    let resolvePending: (response: Response) => void = () => {};
    let rejectPending: (error: Error) => void = () => {};
    const pending = new Promise<Response>((resolve) => { resolvePending = resolve; });
    const pendingFailure = new Promise<Response>((_resolve, reject) => { rejectPending = reject; });
    const responses = [
      pending,
      pendingFailure,
      Promise.resolve(Response.json({ error: 'offline' }, { status: 502 })),
      Promise.resolve(Response.json({ images: null })),
      Promise.resolve(Response.json({ images: [cover], releaseUnavailable: true })),
      Promise.resolve(Response.json({ images: [], releaseUnavailable: false })),
    ];
    const fetcher = installFetch(() => responses.shift()!);
    renderWithProviders(<GameArtworkPicker targetId={targetId} target="banner" busy={false} onApply={vi.fn()} />);
    await selectGame();
    const firstRequest = fetcher.mock.calls.find(([path]) => path === artworkUrl);
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.backToSearch }));
    expect(firstRequest?.[1]?.signal?.aborted).toBe(true);
    await act(async () => resolvePending(Response.json({ images: [screenshot], releaseUnavailable: false })));
    fireEvent.click(screen.getByRole('button', { name: /Source game/ }));
    fireEvent.click(screen.getByRole('button', { name: t.gameArtwork.backToSearch }));
    await act(async () => rejectPending(new Error('aborted request')));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Source game/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.gameArtwork.loadError);
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.gameArtwork.loadError);
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.gameArtwork.releaseError);
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    expect(await screen.findByRole('status')).toHaveTextContent(t.gameArtwork.empty);
  });

  it('keeps the selected preview while saving and disables a second apply', async () => {
    installFetch(() => Response.json({ images: [cover], releaseUnavailable: false }));
    const apply = vi.fn();
    const element = <GameArtworkPicker targetId={targetId} target="cover" busy onApply={apply} />;
    renderWithProviders(element);
    await selectGame();
    fireEvent.click(await screen.findByRole('button', { name: t.gameArtwork.cover }));
    expect(screen.getByRole('button', { name: t.media.setAsCover })).toBeDisabled();
    expect(screen.getByRole('button', { name: t.gameArtwork.backToImages })).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
});
