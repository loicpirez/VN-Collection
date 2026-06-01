import { describe, expect, it } from 'vitest';
import {
  decodeOwnedEditionsResponse,
  decodeVnAspectClientState,
  decodeVnDetailReleasesResponse,
} from '@/lib/vn-detail-client-shape';

const RELEASE = {
  id: 'R90001',
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
  producers: [{ id: 'P90001', name: 'Studio', developer: true, publisher: false }],
  extlinks: [{ url: 'https://example.invalid', label: 'Site', name: 'site' }],
  vns: [{ id: 'V90001', rtype: 'complete' }],
  images: [{ id: 'cv90001', url: 'https://example.invalid/cover.jpg', type: 'pkgfront' }],
};

const OWNED = {
  vn_id: 'V90001',
  release_id: 'R90001',
  notes: null,
  location: 'jp',
  physical_location: ['Shelf'],
  box_type: 'dvd_case',
  edition_label: null,
  condition: 'used',
  price_paid: 1000,
  currency: 'JPY',
  acquired_date: '2026-01-01',
  purchase_place: null,
  owned_platform: 'win',
  rel_platforms: ['win'],
  dumped: false,
  added_at: 1,
  shelf: { kind: 'cell', id: 1, name: 'Shelf', row: 0, col: 1 },
  aspect: {
    width: 1920,
    height: 1080,
    raw_resolution: '1920x1080',
    aspect_key: '16:9',
    source: 'vndb',
    note: null,
  },
};

describe('VN detail client response adapters', () => {
  it('decodes release-list payloads and normalizes ids', () => {
    expect(decodeVnDetailReleasesResponse({ releases: [RELEASE] })).toMatchObject([{
      id: 'r90001',
      producers: [{ id: 'p90001' }],
      vns: [{ id: 'v90001', rtype: 'complete' }],
    }]);
  });

  it('decodes owned-edition rows and aspect payloads', () => {
    expect(decodeOwnedEditionsResponse({ owned: [OWNED] })).toMatchObject([{
      vn_id: 'v90001',
      release_id: 'r90001',
      shelf: { kind: 'cell', id: 1 },
    }]);
    expect(decodeVnAspectClientState({
      override: { aspect_key: '16:9', note: null },
      derived: '4:3',
    })).toEqual({
      override: { aspect_key: '16:9', note: null },
      derived: '4:3',
    });
  });

  it('rejects malformed nested release, owned-edition, and aspect rows', () => {
    expect(decodeVnDetailReleasesResponse({ releases: [{ ...RELEASE, images: [{ id: 'x' }] }] })).toBeNull();
    expect(decodeOwnedEditionsResponse({ owned: [{ ...OWNED, location: 'bad' }] })).toBeNull();
    expect(decodeVnAspectClientState({ override: null, derived: '3:2' })).toBeNull();
  });
});
