/**
 * Source-pin coverage for cover / banner setters on the `vn` table.
 * Round 6 audit (R6-191) noted that several mutating helpers had no
 * direct unit test; this file covers the cover/banner cluster.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  setLocalImagePaths,
  setCustomCover,
  setBanner,
  setBannerPosition,
  setLocalScreenshots,
  setReleaseImages,
  setVnPublishers,
  setCustomDescription,
  addToCollection,
  upsertVn,
  removeFromCollection,
  getCollectionItem,
} from '@/lib/db';

const VN_ID = 'v97600';

function seed() {
  upsertVn({
    id: VN_ID,
    title: 'Sample VN',
    alttitle: null,
    image: null,
    olang: null,
    released: null,
    devstatus: null,
    languages: null,
    platforms: null,
    length: null,
    length_minutes: null,
    length_votes: null,
    rating: null,
    votecount: null,
    average: null,
    description: null,
    titles: null,
    aliases: null,
    extlinks: null,
    developers: null,
    publishers: null,
    tags: null,
    screenshots: null,
    relations: null,
    has_anime: null,
    editions: null,
    staff: null,
    va: null,
  } as never);
}

beforeEach(() => {
  try { removeFromCollection(VN_ID); } catch {}
  seed();
  addToCollection(VN_ID);
});

function getVn(vnId: string) {
  return getCollectionItem(vnId);
}

afterEach(() => {
  try { removeFromCollection(VN_ID); } catch {}
});

describe('setLocalImagePaths', () => {
  it('updates local_image and local_image_thumb columns', () => {
    setLocalImagePaths(VN_ID, '/vn/full.jpg', '/vn/thumb.jpg');
    const vn = getVn(VN_ID);
    expect(vn?.local_image).toBe('/vn/full.jpg');
    expect(vn?.local_image_thumb).toBe('/vn/thumb.jpg');
  });

  it('accepts null to clear paths', () => {
    setLocalImagePaths(VN_ID, '/old/a.jpg', '/old/b.jpg');
    setLocalImagePaths(VN_ID, null, null);
    const vn = getVn(VN_ID);
    expect(vn?.local_image).toBeNull();
    expect(vn?.local_image_thumb).toBeNull();
  });
});

describe('setCustomCover', () => {
  it('stores a custom cover path', () => {
    setCustomCover(VN_ID, '/cover/custom.jpg');
    const vn = getVn(VN_ID);
    expect(vn?.custom_cover).toBe('/cover/custom.jpg');
  });

  it('null clears the custom cover', () => {
    setCustomCover(VN_ID, '/cover/custom.jpg');
    setCustomCover(VN_ID, null);
    const vn = getVn(VN_ID);
    expect(vn?.custom_cover).toBeNull();
  });
});

describe('setBanner', () => {
  it('stores a banner value', () => {
    setBanner(VN_ID, '/banner/img.jpg');
    const vn = getVn(VN_ID);
    expect(vn?.banner_image).toBe('/banner/img.jpg');
  });

  it('null clears the banner', () => {
    setBanner(VN_ID, '/banner/old.jpg');
    setBanner(VN_ID, null);
    expect(getVn(VN_ID)?.banner_image).toBeNull();
  });
});

describe('setBannerPosition', () => {
  it('stores a banner position', () => {
    setBannerPosition(VN_ID, 'center top');
    expect(getVn(VN_ID)?.banner_position).toBe('center top');
  });

  it('null clears the position', () => {
    setBannerPosition(VN_ID, 'center');
    setBannerPosition(VN_ID, null);
    expect(getVn(VN_ID)?.banner_position).toBeNull();
  });
});

describe('setLocalScreenshots', () => {
  it('persists screenshots', () => {
    setLocalScreenshots(VN_ID, [
      { url: 'http://example.test/a.jpg', thumbnail: 'http://example.test/a.t.jpg', sexual: 0 } as never,
    ]);
    const vn = getVn(VN_ID);
    expect(vn?.screenshots ?? []).toHaveLength(1);
    expect((vn?.screenshots ?? [])[0]).toMatchObject({ url: 'http://example.test/a.jpg' });
  });

  it('empty array clears the column', () => {
    setLocalScreenshots(VN_ID, []);
    expect(getVn(VN_ID)?.screenshots ?? []).toEqual([]);
  });
});

describe('setReleaseImages', () => {
  it('persists release images', () => {
    setReleaseImages(VN_ID, [{
      id: 'cv97001',
      release_id: 'r97001',
      release_title: 'Fixture release',
      type: 'pkgfront',
      url: 'x',
    }]);
    expect((getVn(VN_ID)?.release_images ?? [])[0]?.id).toBe('cv97001');
  });
});

describe('setVnPublishers', () => {
  it('stores deduped publishers', () => {
    setVnPublishers(VN_ID, [{ id: 'p97001', name: 'Studio A' }, { id: 'p97002', name: 'Studio B' }]);
    const publishers = getVn(VN_ID)?.publishers ?? [];
    expect(publishers).toHaveLength(2);
    expect(publishers.map((p) => p.id)).toContain('p97001');
  });
});

describe('setCustomDescription', () => {
  it('stores the custom description and clears with null', () => {
    setCustomDescription(VN_ID, 'My personal synopsis');
    let vn = getVn(VN_ID);
    expect(vn?.custom_description).toBe('My personal synopsis');
    setCustomDescription(VN_ID, null);
    vn = getVn(VN_ID);
    expect(vn?.custom_description).toBeNull();
  });
});
