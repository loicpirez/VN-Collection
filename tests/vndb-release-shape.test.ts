import { describe, expect, it } from 'vitest';
import { decodeVndbRelease } from '@/lib/vndb-release-shape';

const RELEASE = {
  id: 'R90041',
  title: 'Fixture release',
  alttitle: null,
  languages: [{ lang: 'ja', title: null, latin: null, mtl: false, main: true }],
  platforms: ['win'],
  media: [{ medium: 'dvd', qty: 1 }],
  released: '2026-01-01',
  minage: 18,
  patch: false,
  freeware: false,
  uncensored: null,
  official: true,
  has_ero: true,
  resolution: [1920, 1080],
  engine: null,
  voiced: 4,
  notes: null,
  gtin: '4900000000000',
  catalog: null,
  producers: [{
    id: 'P90041',
    name: 'Studio',
    developer: true,
    publisher: false,
    original: null,
    aliases: ['Studio alias'],
    lang: 'ja',
    type: 'co',
    description: null,
    extlinks: [{ url: 'https://example.invalid/studio', label: 'Site', name: 'site', id: 41 }],
  }],
  extlinks: [{ url: 'https://example.invalid/release', label: 'Site', name: 'site', id: null }],
  vns: [{
    id: 'V90041',
    rtype: 'complete',
    title: 'Fixture',
    alttitle: null,
    released: '2026-01-01',
    rating: 80,
    image: { url: 'https://example.invalid/vn.jpg', thumbnail: 'https://example.invalid/vn-thumb.jpg', sexual: 0 },
  }],
  images: [{
    id: 'cv90041',
    url: 'https://example.invalid/cover.jpg',
    thumbnail: 'https://example.invalid/cover-thumb.jpg',
    dims: [1200, 1800],
    thumbnail_dims: [200, 300],
    sexual: 0,
    violence: 0,
    votecount: 4,
    type: 'pkgfront',
    languages: ['ja'],
    photo: false,
    vn: 'v90041',
  }],
};

describe('VNDB release row decoder', () => {
  it('preserves selected nested metadata and normalizes entity ids', () => {
    expect(decodeVndbRelease(RELEASE)).toMatchObject({
      id: 'r90041',
      producers: [{
        id: 'p90041',
        aliases: ['Studio alias'],
        extlinks: [{ id: 41 }],
      }],
      extlinks: [{ id: null }],
      vns: [{
        id: 'v90041',
        image: { thumbnail: 'https://example.invalid/vn-thumb.jpg' },
      }],
      images: [{
        thumbnail_dims: [200, 300],
        votecount: 4,
      }],
    });
  });

  it('rejects malformed nested producers, vns, images, and extlinks', () => {
    expect(decodeVndbRelease({ ...RELEASE, producers: [{ id: 'p90041' }] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, vns: [{ id: 'v90041', rtype: 'bad' }] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, images: [{ id: 'cv90041', url: 'x', type: 'bad' }] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, extlinks: [{ url: 'x', label: 'Site', name: 'site', id: {} }] })).toBeNull();
  });

  it('accepts sparse optional nested metadata and null image languages', () => {
    expect(decodeVndbRelease({
      ...RELEASE,
      resolution: null,
      producers: [{
        id: 'p90041',
        name: 'Studio',
        developer: true,
        publisher: false,
      }],
      extlinks: [{ url: 'https://example.invalid/release', label: 'Site', name: 'site' }],
      vns: [
        { id: 'v90041', rtype: 'complete' },
        { id: 'v90042', rtype: 'trial', image: null },
        { id: 'v90043', rtype: 'partial', image: { url: 'https://example.invalid/vn.jpg' } },
      ],
      images: [
        {
          id: 'cv90041',
          url: 'https://example.invalid/cover.jpg',
          type: 'dig',
          languages: null,
        },
        {
          id: 'cv90042',
          url: 'https://example.invalid/cover-2.jpg',
          type: 'pkgfront',
        },
      ],
    })).toMatchObject({
      resolution: null,
      producers: [{ id: 'p90041' }],
      extlinks: [{ url: 'https://example.invalid/release' }],
      vns: [
        { id: 'v90041', rtype: 'complete' },
        { id: 'v90042', rtype: 'trial', image: null },
        { id: 'v90043', rtype: 'partial', image: { url: 'https://example.invalid/vn.jpg' } },
      ],
      images: [
        { languages: null },
        { id: 'cv90042', type: 'pkgfront' },
      ],
    });
    expect(decodeVndbRelease({ ...RELEASE, resolution: '1920x1080' })?.resolution).toBe('1920x1080');
  });

  it('rejects malformed top-level and nested optional metadata', () => {
    expect(decodeVndbRelease({ ...RELEASE, images: null })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, resolution: [1] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, languages: [null] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, platforms: [4] })).toBeNull();
    expect(decodeVndbRelease({ ...RELEASE, media: [{ medium: 'dvd', qty: -1 }] })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      producers: [{ id: 'p90041', name: 'Studio', developer: true, publisher: false, aliases: [4] }],
    })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      producers: [{
        id: 'p90041',
        name: 'Studio',
        developer: true,
        publisher: false,
        extlinks: [{ url: 'x', label: 'Site', name: 'site', id: {} }],
      }],
    })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      producers: [{ id: 'p90041', name: 'Studio', developer: true, publisher: false, extlinks: {} }],
    })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      vns: [{ id: 'v90041', rtype: 'complete', image: { url: 4 } }],
    })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      images: [{ id: 'cv90041', url: 'x', type: 'pkgfront', dims: [1] }],
    })).toBeNull();
    expect(decodeVndbRelease({
      ...RELEASE,
      images: [{ id: 'cv90041', url: 'x', type: 'pkgfront', languages: [4] }],
    })).toBeNull();
  });
});
