import { describe, expect, it } from 'vitest';
import {
  createVndbResultsEnvelopeDecoder,
  decodeVndbAuthInfo,
  decodeVndbStaffCreditListRow,
  decodeVndbStatsGlobal,
  decodeVndbUlistEntryDetailRow,
  decodeVndbUlistEntryRow,
  decodeVndbUlistLabelsResponse,
  decodeVndbUserLookup,
  decodeVndbVaCreditListRow,
} from '../src/lib/vndb-client-shape';

describe('VNDB client payload adapters', () => {
  it('filters malformed endpoint rows while preserving pagination metadata', () => {
    const decode = createVndbResultsEnvelopeDecoder((value) =>
      typeof value === 'string' ? value.toUpperCase() : null,
    );
    expect(decode({ results: ['valid', 3], more: true, count: 2 })).toEqual({
      results: ['VALID'],
      more: true,
      count: 2,
    });
    expect(decode(null)).toBeNull();
  });

  it('normalizes staff-credit and voice-credit nested arrays', () => {
    expect(decodeVndbStaffCreditListRow({
      id: 'V90001',
      title: 'Entry',
      alttitle: null,
      released: null,
      rating: null,
      image: null,
      staff: [{ id: 'S90001', role: 'scenario', note: null }, { id: 1 }],
    })).toEqual({
      id: 'v90001',
      title: 'Entry',
      alttitle: null,
      released: null,
      rating: null,
      image: null,
      staff: [{ id: 's90001', role: 'scenario', note: null }],
    });
    expect(decodeVndbVaCreditListRow({
      id: 'v90001',
      title: 'Entry',
      alttitle: null,
      released: null,
      rating: null,
      image: { url: 'https://example.invalid/cover.jpg', thumbnail: null },
      va: [
        {
          staff: { id: 'S90001' },
          note: null,
          character: { id: 'C90001', name: 'Character', original: null, image: null },
        },
        { staff: null },
      ],
    })?.va).toEqual([{
      staff: { id: 's90001' },
      note: null,
      character: { id: 'c90001', name: 'Character', original: null, image: null },
    }]);
  });

  it('preserves credit images and drops malformed nested credit variants', () => {
    const staffBase = {
      id: 'v90001',
      title: 'Entry',
      alttitle: null,
      released: null,
      rating: null,
      image: { url: 'https://example.invalid/cover.jpg', thumbnail: null },
    };
    expect(decodeVndbStaffCreditListRow({
      ...staffBase,
      staff: [
        { id: 's90001', role: 'scenario', note: null },
        { id: 'bad', role: 'scenario', note: null },
        { id: 's90002', role: 4, note: null },
        { id: 's90003', role: 'art', note: 4 },
      ],
    })?.staff).toEqual([{ id: 's90001', role: 'scenario', note: null }]);
    expect(decodeVndbStaffCreditListRow({
      ...staffBase,
      image: { url: 4, thumbnail: null },
      staff: [],
    })).toBeNull();

    const vaBase = {
      ...staffBase,
      va: [{
        staff: { id: 'S90001' },
        note: null,
        character: {
          id: 'C90001',
          name: 'Character',
          original: null,
          image: { url: 'https://example.invalid/character.jpg' },
        },
      }],
    };
    expect(decodeVndbVaCreditListRow(vaBase)?.va[0]?.character.image).toEqual({
      url: 'https://example.invalid/character.jpg',
    });
    expect(decodeVndbVaCreditListRow({
      ...vaBase,
      va: [
        { staff: { id: 'bad' }, note: null, character: vaBase.va[0].character },
        { staff: { id: 's90001' }, note: 4, character: vaBase.va[0].character },
        { staff: { id: 's90001' }, note: null, character: { ...vaBase.va[0].character, id: 'bad' } },
        { staff: { id: 's90001' }, note: null, character: { ...vaBase.va[0].character, name: 4 } },
        { staff: { id: 's90001' }, note: null, character: { ...vaBase.va[0].character, original: 4 } },
        { staff: { id: 's90001' }, note: null, character: { ...vaBase.va[0].character, image: { url: 4 } } },
      ],
    })?.va).toEqual([]);
  });

  it('normalizes wishlist rows and drops malformed nested labels and developers', () => {
    expect(decodeVndbUlistEntryRow({
      id: 'V90001',
      added: 1,
      voted: null,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: [{ id: 5, label: 'Wishlist' }, { id: 'bad' }],
      vn: {
        title: 'Entry',
        alttitle: null,
        released: null,
        rating: null,
        votecount: null,
        length_minutes: null,
        languages: ['ja'],
        platforms: ['win'],
        image: null,
        developers: [{ id: 'P90001', name: 'Studio' }, null],
      },
    })).toMatchObject({
      id: 'v90001',
      labels: [{ id: 5, label: 'Wishlist' }],
      vn: {
        id: 'v90001',
        developers: [{ id: 'p90001', name: 'Studio' }],
      },
    });
  });

  it('preserves wishlist image metadata and rejects malformed image variants', () => {
    const row = {
      id: 'v90001',
      added: 1,
      voted: null,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: [],
      vn: {
        title: 'Entry',
        alttitle: null,
        released: null,
        rating: null,
        votecount: null,
        length_minutes: null,
        languages: ['ja'],
        platforms: ['win'],
        image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg', sexual: 1 },
        developers: [],
      },
    };
    expect(decodeVndbUlistEntryRow(row)?.vn.image).toEqual({
      url: 'https://example.invalid/cover.jpg',
      thumbnail: 'https://example.invalid/thumb.jpg',
      sexual: 1,
    });
    expect(decodeVndbUlistEntryRow({
      ...row,
      vn: { ...row.vn, image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' } },
    })?.vn.image).toEqual({
      url: 'https://example.invalid/cover.jpg',
      thumbnail: 'https://example.invalid/thumb.jpg',
    });
    expect(decodeVndbUlistEntryRow({
      ...row,
      vn: { ...row.vn, image: { url: 'https://example.invalid/cover.jpg' } },
    })).toBeNull();
    expect(decodeVndbUlistEntryRow({
      ...row,
      vn: { ...row.vn, image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'x', sexual: Number.NaN } },
    })).toBeNull();
  });

  it('validates ulist detail and label envelopes', () => {
    expect(decodeVndbUlistEntryDetailRow({
      id: 'v90001',
      added: 1,
      voted: 1,
      lastmod: 2,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: [],
    })?.id).toBe('v90001');
    expect(decodeVndbUlistLabelsResponse({
      labels: [
        { id: 5, label: 'Wishlist', private: false, count: 3 },
        { id: 'bad' },
      ],
    })).toEqual({ labels: [{ id: 5, label: 'Wishlist', private: false, count: 3 }] });
    expect(decodeVndbUlistLabelsResponse({
      labels: [{ id: 5, label: 'Wishlist', private: false }],
    })).toEqual({ labels: [{ id: 5, label: 'Wishlist', private: false }] });
    expect(decodeVndbUlistLabelsResponse({
      labels: [{ id: 5, label: 'Wishlist', private: false, count: -1 }],
    })).toEqual({ labels: [] });
  });

  it('validates typed GET response shapes', () => {
    expect(decodeVndbStatsGlobal({
      chars: 1,
      producers: 2,
      releases: 3,
      staff: 4,
      tags: 5,
      traits: 6,
      vn: 7,
    })?.vn).toBe(7);
    expect(decodeVndbAuthInfo({ id: 'u90001', username: 'operator', permissions: ['listread'] })).toEqual({
      id: 'u90001',
      username: 'operator',
      permissions: ['listread'],
    });
    expect(decodeVndbUserLookup({
      operator: { id: 'u90001', username: 'operator', lengthvotes: 1 },
      complete: { id: 'u90002', username: 'complete', lengthvotes_sum: 20 },
      sparse: { id: 'u90003', username: 'sparse' },
      missing: null,
    })).toEqual({
      operator: { id: 'u90001', username: 'operator', lengthvotes: 1 },
      complete: { id: 'u90002', username: 'complete', lengthvotes_sum: 20 },
      sparse: { id: 'u90003', username: 'sparse' },
      missing: null,
    });
  });

  it('rejects malformed required containers and typed GET rows', () => {
    expect(decodeVndbStaffCreditListRow({ id: 'v90001', staff: null })).toBeNull();
    expect(decodeVndbStaffCreditListRow(null)).toBeNull();
    expect(decodeVndbVaCreditListRow({ id: 'v90001', va: null })).toBeNull();
    expect(decodeVndbVaCreditListRow(null)).toBeNull();
    expect(decodeVndbUlistEntryRow({ id: 'v90001', labels: [] })).toBeNull();
    expect(decodeVndbUlistEntryDetailRow({ id: 'v90001', labels: null })).toBeNull();
    expect(decodeVndbUlistLabelsResponse({ labels: null })).toBeNull();
    expect(decodeVndbStatsGlobal({ chars: -1 })).toBeNull();
    expect(decodeVndbAuthInfo({ id: 'u90001', username: 'operator', permissions: null })).toBeNull();
    expect(decodeVndbUserLookup({ operator: { id: null } })).toBeNull();
    expect(decodeVndbUserLookup(null)).toBeNull();
    expect(decodeVndbUserLookup({ operator: { id: 'u90001', username: 'operator', lengthvotes: -1 } })).toBeNull();
    expect(decodeVndbUserLookup({ operator: { id: 'u90001', username: 'operator', lengthvotes_sum: -1 } })).toBeNull();
  });
});
