import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/vn/[id]/artwork/route';
import { decodeGameArtwork, MAX_GAME_ARTWORK, type GameArtworkImage } from '@/lib/game-artwork';

const { read, getVn, getReleases, limited } = vi.hoisted(() => ({
  read: vi.fn(), getVn: vi.fn(), getReleases: vi.fn(), limited: vi.fn(),
}));
vi.mock('@/lib/db/repositories/vn-read', () => ({ getVnReadRepository: () => ({ getCollectionItem: read }) }));
vi.mock('@/lib/vndb', () => ({ getVn, getReleasesForVn: getReleases }));
vi.mock('@/lib/rate-limit-response', () => ({ tooManyRequests: limited }));

const root = 'https://s2.vndb.org';
const poster = `${root}/cv/01/90001.jpg`;
const screen = `${root}/sf/01/90001.jpg`;
const releaseArt = `${root}/rf/01/90001.jpg`;

function request(id = 'v90001', host = 'localhost') {
  return GET(new NextRequest(`http://${host}/api/vn/${id}/artwork`), { params: Promise.resolve({ id }) });
}

describe('game artwork browsing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getReleases.mockResolvedValue([]);
  });

  it('gates external calls before using the database', async () => {
    const response = await request('v90001', 'example.test');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Forbidden') });
    expect(read).not.toHaveBeenCalled();
  });

  it('validates ids and forwards rate limits', async () => {
    const invalid = await request('invalid');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid id' });
    limited.mockReturnValue(Response.json({ error: 'rate limited' }, { status: 429 }));
    const busy = await request();
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({ error: 'rate limited' });
    expect(read).not.toHaveBeenCalled();
  });

  it('returns bounded, deduplicated cached artwork with local mirrors and source classification', async () => {
    read.mockResolvedValue({
      image_url: poster, image_thumb: 'https://127.0.0.1/blocked.jpg',
      local_image: 'vn/v90001.jpg', local_image_thumb: 'vn/v90001-thumb.jpg', image_sexual: 0,
      custom_cover: 'cover/v90001-copy.webp', banner_image: 'cover/v90001-banner.jpg',
      screenshots: [
        { url: screen, thumbnail: screen, local: 'vn-sc/v90001.jpg', sexual: 1.5 },
        { url: screen }, { url: 'https://example.test/private.jpg', local: 'vn/../private.jpg' },
      ],
      release_images: [
        { url: releaseArt, type: 'pkgfront', release_title: 'Release X', thumbnail: null },
        ...Array.from({ length: MAX_GAME_ARTWORK }, (_, i) => ({
          url: `${root}/rf/02/${i}.jpg`, type: 'pkgback', release_title: 'Release Y', dims: [200, 300],
        })),
      ],
    });
    const response = await request('V90001');
    expect(response.status).toBe(200);
    const result = decodeGameArtwork(await response.json());
    expect(result?.images).toHaveLength(MAX_GAME_ARTWORK);
    expect(result?.images.slice(0, 5)).toMatchObject([
      { kind: 'cover', value: poster, local: 'vn/v90001.jpg', thumbnail: null, sexual: 0 },
      { kind: 'cover', value: 'cover/v90001-copy.webp', sexual: null },
      { kind: 'banner', value: 'cover/v90001-banner.jpg', sexual: null },
      { kind: 'screenshot', value: screen, thumbnail: screen, sexual: 1.5 },
      { kind: 'release', value: releaseArt, releaseType: 'pkgfront', label: 'Release X' },
    ]);
    expect(getVn).not.toHaveBeenCalled();
    expect(getReleases).not.toHaveBeenCalled();
  });

  it('loads an uncached game and its matching release artwork without a detail-page refresh', async () => {
    getVn.mockResolvedValue({ image: { url: poster, thumbnail: poster, sexual: 0.4 }, screenshots: [{ url: screen }] });
    getReleases.mockResolvedValue([
      { id: 'r90001', title: 'Release X', vns: [{ id: 'v90001' }], images: [{ url: releaseArt, type: 'pkgfront' }] },
      { id: 'r90002', title: 'Release Y', vns: [{ id: 'v90002' }], images: [{ url: `${root}/rf/02/90002.jpg` }] },
    ]);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      images: [{ value: poster, sexual: 0.4 }, { value: screen }, { value: releaseArt }],
      releaseUnavailable: false,
    });
    expect(getVn).toHaveBeenCalledWith('v90001', expect.any(AbortSignal));
    expect(getReleases).toHaveBeenCalledWith('v90001', 50, expect.any(AbortSignal));
  });

  it('returns usable cached artwork when release artwork fails', async () => {
    read.mockResolvedValue({ image_url: poster });
    getReleases.mockRejectedValue(new Error('offline'));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ images: [{ value: poster }], releaseUnavailable: true });
  });

  it('loads local-only games without consulting VNDB', async () => {
    read.mockResolvedValue({ image_url: null, local_image: 'vn/egs_9500001.jpg', release_images: [] });
    const response = await request('egs_9500001');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      images: [{ value: 'vn/egs_9500001.jpg', remote: null }],
      releaseUnavailable: false,
    });
    expect(getVn).not.toHaveBeenCalled();
    expect(getReleases).not.toHaveBeenCalled();
  });

  it('distinguishes missing games from upstream failure', async () => {
    getVn.mockResolvedValue(null);
    for (const id of ['v90001', 'egs_9500001']) {
      const response = await request(id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not found' });
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      getVn.mockRejectedValue(new Error('offline'));
      const response = await request();
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: expect.any(String) });
    } finally {
      error.mockRestore();
    }
  });
});

describe('game artwork response decoding', () => {
  const image: GameArtworkImage = {
    kind: 'cover', value: poster, remote: poster, local: null, thumbnail: null,
    localThumbnail: null, sexual: 0, releaseType: null, label: null,
  };

  it('rejects malformed envelopes and image fields', () => {
    for (const value of [null, {}, { images: [] }, { images: Array(MAX_GAME_ARTWORK + 1).fill(image) }]) {
      expect(decodeGameArtwork(value)).toBeNull();
    }
    for (const invalid of [
      null, { kind: 'character' }, { value: 1 }, { value: '' }, { remote: 1 }, { local: 1 },
      { remote: null }, { thumbnail: 1 }, { localThumbnail: 1 }, { sexual: '0' },
      { sexual: Infinity }, { releaseType: 'unknown' }, { label: 1 },
    ]) {
      expect(decodeGameArtwork({ images: [invalid && { ...image, ...invalid }], releaseUnavailable: false })).toBeNull();
    }
    for (const releaseType of ['pkgfront', 'pkgback', 'pkgcontent', 'pkgside', 'pkgmed', 'dig']) {
      expect(decodeGameArtwork({ images: [{ ...image, kind: 'release', releaseType }], releaseUnavailable: true }))
        .toMatchObject({ images: [{ releaseType }], releaseUnavailable: true });
    }
  });
});
