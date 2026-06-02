/**
 * Hermetic coverage for `src/lib/assets.ts` — `ensureLocalImagesForVn`.
 *
 * Every collaborator (`./files`, `./db`, `./vndb`, `./erogamescape`) is
 * mocked so no real network or filesystem write happens. The tests drive
 * each branch of the fan-out: missing item early-return, cover/thumb
 * download + persist, screenshot concurrency + per-shot failure + skip
 * when the local file already exists, release-image aggregation of
 * publishers (including the "fetch failed -> don't wipe publishers" guard
 * and the dedup-by-key path), character-portrait mirroring (download +
 * skip-when-fresh), quote cache warming, EGS resolve + cover mirror, and
 * the in-flight dedup lock that makes two concurrent calls share one run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Screenshot } from '@/lib/types';
import type { VndbCharacter } from '@/lib/vndb';

vi.mock('@/lib/files', () => ({
  downloadToBucket: vi.fn(),
  fileExists: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  getCharacterImages: vi.fn(),
  getCollectionItem: vi.fn(),
  getEgsForVn: vi.fn(),
  setEgsLocalImage: vi.fn(),
  setLocalImagePaths: vi.fn(),
  setLocalScreenshots: vi.fn(),
  setQuotesForVn: vi.fn(),
  setReleaseImages: vi.fn(),
  setVnPublishers: vi.fn(),
  upsertCharacterImage: vi.fn(),
}));
vi.mock('@/lib/vndb', () => ({
  getCharactersForVn: vi.fn(),
  getQuotesForVn: vi.fn(),
  getReleasesForVn: vi.fn(),
}));
vi.mock('@/lib/erogamescape', () => ({
  resolveEgsForVn: vi.fn(),
}));

import { ensureLocalImagesForVn } from '@/lib/assets';
import {
  downloadToBucket,
  fileExists,
} from '@/lib/files';
import {
  getCharacterImages,
  getCollectionItem,
  getEgsForVn,
  setEgsLocalImage,
  setLocalImagePaths,
  setLocalScreenshots,
  setQuotesForVn,
  setReleaseImages,
  setVnPublishers,
  upsertCharacterImage,
} from '@/lib/db';
import {
  getCharactersForVn,
  getQuotesForVn,
  getReleasesForVn,
} from '@/lib/vndb';
import { resolveEgsForVn } from '@/lib/erogamescape';

const mDownload = vi.mocked(downloadToBucket);
const mFileExists = vi.mocked(fileExists);
const mGetItem = vi.mocked(getCollectionItem);
const mGetCharImages = vi.mocked(getCharacterImages);
const mGetEgs = vi.mocked(getEgsForVn);
const mSetEgsLocal = vi.mocked(setEgsLocalImage);
const mSetLocalImagePaths = vi.mocked(setLocalImagePaths);
const mSetLocalScreenshots = vi.mocked(setLocalScreenshots);
const mSetQuotes = vi.mocked(setQuotesForVn);
const mSetReleaseImages = vi.mocked(setReleaseImages);
const mSetVnPublishers = vi.mocked(setVnPublishers);
const mUpsertCharImage = vi.mocked(upsertCharacterImage);
const mGetChars = vi.mocked(getCharactersForVn);
const mGetQuotes = vi.mocked(getQuotesForVn);
const mGetReleases = vi.mocked(getReleasesForVn);
const mResolveEgs = vi.mocked(resolveEgsForVn);

type Item = NonNullable<ReturnType<typeof getCollectionItem>>;

function baseItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'v90001',
    image_url: null,
    image_thumb: null,
    local_image: null,
    local_image_thumb: null,
    screenshots: [],
    release_images: [],
    ...overrides,
  } as unknown as Item;
}

function quietDownstream(): void {
  // Default: every secondary fan-out succeeds with empty data so the
  // tests that focus on the cover/screenshot path don't trip an
  // unmocked call. Individual tests override as needed.
  mGetReleases.mockResolvedValue([]);
  mGetChars.mockResolvedValue([]);
  mGetQuotes.mockResolvedValue([]);
  mGetCharImages.mockReturnValue(new Map());
  mGetEgs.mockReturnValue(null);
  mResolveEgs.mockResolvedValue(undefined as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  quietDownstream();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ensureLocalImagesForVn — early return', () => {
  it('returns an empty result and touches nothing when the VN is not in the collection', async () => {
    mGetItem.mockReturnValue(null);
    const result = await ensureLocalImagesForVn('v90404');
    expect(result).toEqual({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] });
    expect(mDownload).not.toHaveBeenCalled();
    expect(mSetLocalImagePaths).not.toHaveBeenCalled();
    expect(mGetReleases).not.toHaveBeenCalled();
  });
});

describe('ensureLocalImagesForVn — cover + thumbnail', () => {
  it('downloads cover and thumb when absent and persists the new paths', async () => {
    mGetItem.mockReturnValue(
      baseItem({ image_url: 'https://cdn.vndb.org/cv/a.jpg', image_thumb: 'https://cdn.vndb.org/cv/a-t.jpg' }),
    );
    mFileExists.mockResolvedValue(false);
    mDownload.mockImplementation(async (_url, _bucket, hint) => `vn/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(mDownload).toHaveBeenCalledWith('https://cdn.vndb.org/cv/a.jpg', 'vnImage', 'v90001-cover');
    expect(mDownload).toHaveBeenCalledWith('https://cdn.vndb.org/cv/a-t.jpg', 'vnImage', 'v90001-cover-thumb');
    expect(mSetLocalImagePaths).toHaveBeenCalledWith('v90001', 'vn/v90001-cover.jpg', 'vn/v90001-cover-thumb.jpg');
    expect(result.poster).toBe('vn/v90001-cover.jpg');
    expect(result.posterThumb).toBe('vn/v90001-cover-thumb.jpg');
  });

  it('keeps the existing path and does not persist when the cover download throws', async () => {
    mGetItem.mockReturnValue(
      baseItem({ image_url: 'https://cdn.vndb.org/cv/a.jpg', local_image: 'vn/old-cover.jpg' }),
    );
    mFileExists.mockResolvedValue(false);
    mDownload.mockRejectedValue(new Error('boom'));

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.poster).toBe('vn/old-cover.jpg');
    // poster equals prior local_image and thumb stays null -> no persist.
    expect(mSetLocalImagePaths).not.toHaveBeenCalled();
  });

  it('keeps the existing thumbnail path when its refresh download throws', async () => {
    mGetItem.mockReturnValue(
      baseItem({ image_thumb: 'https://cdn.vndb.org/cv/a-t.jpg', local_image_thumb: 'vn/old-thumb.jpg' }),
    );
    mFileExists.mockResolvedValue(false);
    mDownload.mockRejectedValue(new Error('boom'));

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.posterThumb).toBe('vn/old-thumb.jpg');
    expect(mSetLocalImagePaths).not.toHaveBeenCalled();
  });

  it('skips re-downloading the cover when a local copy already exists on disk', async () => {
    mGetItem.mockReturnValue(
      baseItem({ image_url: 'https://cdn.vndb.org/cv/a.jpg', local_image: 'vn/have.jpg' }),
    );
    mFileExists.mockResolvedValue(true);

    await ensureLocalImagesForVn('v90001');

    expect(mDownload).not.toHaveBeenCalledWith('https://cdn.vndb.org/cv/a.jpg', 'vnImage', expect.anything());
    expect(mSetLocalImagePaths).not.toHaveBeenCalled();
  });
});

describe('ensureLocalImagesForVn — screenshots', () => {
  it('downloads missing screenshot + thumbnail and persists when at least one mutated', async () => {
    const shots: Screenshot[] = [
      { url: 'https://cdn.vndb.org/sf/0.jpg', thumbnail: 'https://cdn.vndb.org/st/0.jpg' },
      { url: 'https://cdn.vndb.org/sf/1.jpg', thumbnail: 'https://cdn.vndb.org/st/1.jpg', local: 'vn-sc/have.jpg', local_thumb: 'vn-sc/have-t.jpg' },
    ];
    mGetItem.mockReturnValue(baseItem({ screenshots: shots }));
    // First shot: not on disk -> downloads both. Second shot: already on disk.
    mFileExists.mockImplementation(async (p: string) => p.startsWith('vn-sc/have'));
    mDownload.mockImplementation(async (_u, _b, hint) => `vn-sc/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(mDownload).toHaveBeenCalledWith('https://cdn.vndb.org/sf/0.jpg', 'vnScreenshot', 'v90001-sc-0');
    expect(mDownload).toHaveBeenCalledWith('https://cdn.vndb.org/st/0.jpg', 'vnScreenshot', 'v90001-sc-0-thumb');
    expect(mSetLocalScreenshots).toHaveBeenCalledTimes(1);
    expect(result.screenshots[0].local).toBe('vn-sc/v90001-sc-0.jpg');
    expect(result.screenshots[1].local).toBe('vn-sc/have.jpg');
  });

  it('swallows a per-screenshot download failure without persisting', async () => {
    const shots: Screenshot[] = [{ url: 'https://cdn.vndb.org/sf/0.jpg', thumbnail: '' }];
    mGetItem.mockReturnValue(baseItem({ screenshots: shots }));
    mFileExists.mockResolvedValue(false);
    mDownload.mockRejectedValue(new Error('shot failed'));

    const result = await ensureLocalImagesForVn('v90001');

    expect(mSetLocalScreenshots).not.toHaveBeenCalled();
    expect(result.screenshots[0].local).toBeNull();
  });

  it('drives the bounded worker pool past the concurrency limit (>4 shots)', async () => {
    const shots: Screenshot[] = Array.from({ length: 7 }, (_, i) => ({
      url: `https://cdn.vndb.org/sf/${i}.jpg`,
      thumbnail: '',
    }));
    mGetItem.mockReturnValue(baseItem({ screenshots: shots }));
    mFileExists.mockResolvedValue(false);
    mDownload.mockImplementation(async (_u, _b, hint) => `vn-sc/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.screenshots).toHaveLength(7);
    expect(result.screenshots.every((s, i) => s.local === `vn-sc/v90001-sc-${i}.jpg`)).toBe(true);
  });
});

describe('ensureLocalImagesForVn — release images + publisher aggregation', () => {
  it('aggregates de-duplicated publishers and mirrors release artwork', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetReleases.mockResolvedValue([
      {
        id: 'r1',
        title: 'Rel A',
        vns: [{ id: 'v90001' }],
        producers: [
          { id: 'p1', name: 'Pub One', publisher: true },
          { id: 'p1', name: 'Pub One', publisher: true }, // dup -> collapsed
          { id: 'p2', name: 'Dev Only', publisher: false }, // not a publisher -> skipped
          { id: 'p3', name: '', publisher: true }, // empty name -> skipped
        ],
        images: [{ id: 'ri1', type: 'pkgfront', url: 'https://cdn.vndb.org/cv/r1.jpg', thumbnail: null }],
      },
      {
        // Release that does not include this VN -> entirely skipped.
        id: 'r2',
        title: 'Other',
        vns: [{ id: 'v99999' }],
        producers: [{ id: 'p9', name: 'Ghost', publisher: true }],
        images: [{ id: 'ri9', type: 'pkgfront', url: 'https://cdn.vndb.org/cv/r2.jpg' }],
      },
    ] as never);
    mFileExists.mockResolvedValue(false);
    mDownload.mockImplementation(async (_u, _b, hint) => `vn-sc/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(mSetVnPublishers).toHaveBeenCalledWith('v90001', [{ id: 'p1', name: 'Pub One' }]);
    expect(result.releaseImages).toHaveLength(1);
    expect(result.releaseImages[0].release_id).toBe('r1');
    expect(result.releaseImages[0].local).toBe('vn-sc/v90001-rel-pkgfront-0.jpg');
    expect(mSetReleaseImages).toHaveBeenCalledTimes(1);
  });

  it('reuses the previously stored local path for an unchanged release image', async () => {
    mGetItem.mockReturnValue(
      baseItem({
        release_images: [
          {
            id: 'ri1',
            release_id: 'r1',
            release_title: 'Rel A',
            type: 'pkgfront',
            url: 'https://cdn.vndb.org/cv/r1.jpg',
            local: 'vn-sc/cached.jpg',
            local_thumb: null,
          },
        ],
      }),
    );
    mGetReleases.mockResolvedValue([
      {
        id: 'r1',
        title: 'Rel A',
        vns: [{ id: 'v90001' }],
        producers: [],
        images: [{ id: 'ri1', type: 'pkgfront', url: 'https://cdn.vndb.org/cv/r1.jpg' }],
      },
    ] as never);
    mFileExists.mockResolvedValue(true); // cached file present -> no re-download

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.releaseImages[0].local).toBe('vn-sc/cached.jpg');
    expect(mDownload).not.toHaveBeenCalled();
  });

  it('mirrors a release thumbnail alongside its full package image', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetReleases.mockResolvedValue([
      {
        id: 'r1',
        title: 'Rel A',
        vns: [{ id: 'v90001' }],
        producers: [],
        images: [{
          id: 'ri1',
          type: 'pkgfront',
          url: 'https://cdn.vndb.org/cv/r1.jpg',
          thumbnail: 'https://cdn.vndb.org/cv/r1-t.jpg',
        }],
      },
    ] as never);
    mFileExists.mockResolvedValue(false);
    mDownload.mockImplementation(async (_url, _bucket, hint) => `vn-sc/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.releaseImages[0].local_thumb).toBe('vn-sc/v90001-rel-pkgfront-0-thumb.jpg');
  });

  it('refreshes a stale locally stored release thumbnail', async () => {
    mGetItem.mockReturnValue(
      baseItem({
        release_images: [{
          id: 'ri1',
          release_id: 'r1',
          release_title: 'Rel A',
          type: 'pkgfront',
          url: 'https://cdn.vndb.org/cv/r1.jpg',
          local: 'vn-sc/r1.jpg',
          local_thumb: 'vn-sc/r1-t-old.jpg',
        }],
      }),
    );
    mGetReleases.mockResolvedValue([
      {
        id: 'r1',
        title: 'Rel A',
        vns: [{ id: 'v90001' }],
        producers: [],
        images: [{
          id: 'ri1',
          type: 'pkgfront',
          url: 'https://cdn.vndb.org/cv/r1.jpg',
          thumbnail: 'https://cdn.vndb.org/cv/r1-t.jpg',
        }],
      },
    ] as never);
    mFileExists.mockImplementation(async (path) => path === 'vn-sc/r1.jpg');
    mDownload.mockImplementation(async (_url, _bucket, hint) => `vn-sc/${hint}.jpg`);

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.releaseImages[0].local_thumb).toBe('vn-sc/v90001-rel-pkgfront-0-thumb.jpg');
  });

  it('uses an empty prior release-image list if the VN disappears during the release refresh', async () => {
    mGetItem.mockReturnValueOnce(baseItem()).mockReturnValue(null);
    mGetReleases.mockResolvedValue([]);

    await expect(ensureLocalImagesForVn('v90001')).resolves.toMatchObject({ releaseImages: [] });
  });

  it('returns no release images and never wipes publishers when the release fetch throws', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetReleases.mockRejectedValue(new Error('VNDB down'));

    const result = await ensureLocalImagesForVn('v90001');

    expect(result.releaseImages).toEqual([]);
    expect(mSetVnPublishers).not.toHaveBeenCalled();
    expect(mSetReleaseImages).not.toHaveBeenCalled();
  });
});

describe('ensureLocalImagesForVn — characters, quotes, EGS', () => {
  it('downloads a character portrait that is missing and skips one already fresh', async () => {
    mGetItem.mockReturnValue(baseItem());
    const chars: VndbCharacter[] = [
      { id: 'c1', image: { url: 'https://cdn.vndb.org/ch/1.jpg' } } as unknown as VndbCharacter,
      { id: 'c2', image: { url: 'https://cdn.vndb.org/ch/2.jpg' } } as unknown as VndbCharacter,
      { id: 'c3', image: null } as unknown as VndbCharacter, // no image -> skipped entirely
    ];
    mGetChars.mockResolvedValue(chars);
    mGetCharImages.mockReturnValue(
      new Map([['c2', { url: 'https://cdn.vndb.org/ch/2.jpg', local_path: 'character/c2.jpg', fetched_at: 1 }]]),
    );
    // c2's cached path resolves on disk -> skip; everything else absent.
    mFileExists.mockImplementation(async (p: string) => p === 'character/c2.jpg');
    mDownload.mockImplementation(async (_u, _b, hint) => `character/${hint}.jpg`);

    await ensureLocalImagesForVn('v90001');

    expect(mUpsertCharImage).toHaveBeenCalledWith('c1', 'https://cdn.vndb.org/ch/1.jpg', 'character/c1.jpg');
    expect(mUpsertCharImage).not.toHaveBeenCalledWith('c2', expect.anything(), expect.anything());
  });

  it('swallows a character fetch failure and still warms the quote cache', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetChars.mockRejectedValue(new Error('chars unavailable'));
    mGetQuotes.mockResolvedValue([{ id: 'q1' }] as never);

    await ensureLocalImagesForVn('v90001');

    expect(mSetQuotes).toHaveBeenCalledWith('v90001', [{ id: 'q1' }]);
  });

  it('mirrors the EGS cover when an EGS match exists with a remote cover not yet local', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetEgs.mockReturnValue({ egs_id: 555, image_url: 'https://erogamescape.dyndns.org/cover.jpg', local_image: null } as never);
    mFileExists.mockResolvedValue(false);
    mDownload.mockImplementation(async (_u, _b, hint) => `vn/${hint}.jpg`);

    await ensureLocalImagesForVn('v90001');

    expect(mDownload).toHaveBeenCalledWith('https://erogamescape.dyndns.org/cover.jpg', 'vnImage', 'v90001-egs-cover');
    expect(mSetEgsLocal).toHaveBeenCalledWith('v90001', 'vn/v90001-egs-cover.jpg');
  });

  it('swallows an EGS cover download failure without persisting', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetEgs.mockReturnValue({ egs_id: 555, image_url: 'https://erogamescape.dyndns.org/cover.jpg', local_image: null } as never);
    mFileExists.mockResolvedValue(false);
    mDownload.mockRejectedValue(new Error('no cover'));

    await ensureLocalImagesForVn('v90001');

    expect(mSetEgsLocal).not.toHaveBeenCalled();
  });

  it('does not mirror the EGS cover when the local copy is already present', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetEgs.mockReturnValue({ egs_id: 555, image_url: 'https://erogamescape.dyndns.org/cover.jpg', local_image: 'vn/egs.jpg' } as never);
    mFileExists.mockResolvedValue(true);

    await ensureLocalImagesForVn('v90001');

    expect(mSetEgsLocal).not.toHaveBeenCalled();
  });

  it('swallows a thrown quote fetch and a thrown EGS resolve', async () => {
    mGetItem.mockReturnValue(baseItem());
    mGetQuotes.mockRejectedValue(new Error('quotes down'));
    mResolveEgs.mockRejectedValue(new Error('egs down'));

    await expect(ensureLocalImagesForVn('v90001')).resolves.toMatchObject({ screenshots: [], releaseImages: [] });
    expect(mSetQuotes).not.toHaveBeenCalled();
  });
});

describe('ensureLocalImagesForVn — in-flight dedup lock', () => {
  it('shares a single fan-out between two concurrent callers for the same id', async () => {
    mGetItem.mockReturnValue(baseItem());
    const [a, b] = await Promise.all([
      ensureLocalImagesForVn('v90001'),
      ensureLocalImagesForVn('v90001'),
    ]);
    // Same shared run -> the release walk fires exactly once for the pair.
    expect(mGetReleases).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('releases the lock so a later call re-runs the fan-out', async () => {
    mGetItem.mockReturnValue(baseItem());
    await ensureLocalImagesForVn('v90001');
    await ensureLocalImagesForVn('v90001');
    expect(mGetReleases).toHaveBeenCalledTimes(2);
  });
});
