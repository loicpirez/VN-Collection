import { describe, expect, it } from 'vitest';
import {
  decodeCollectionBulkRow,
  decodeCollectionCardItem,
  decodeCollectionCompareRow,
  decodeCollectionPage,
  decodeCollectionSelectiveRow,
  decodeLibraryCollectionResponse,
  decodeLibraryDefaults,
  decodeLibraryProducerFacets,
  decodeLibrarySeriesFacets,
  decodeLibraryTagFacets,
} from '../src/lib/collection-client-shape';

const card = {
  id: 'V90001',
  title: 'Title',
  alttitle: null,
  image_url: null,
  image_thumb: null,
  image_sexual: null,
  released: null,
  length_minutes: null,
  rating: null,
  developers: [{ id: 'P90001', name: 'Studio' }],
  publishers: [],
  tags: [{ id: 'G90001', name: 'Tag', rating: 1, spoiler: 0 }],
  relations: [],
  local_image: null,
  local_image_thumb: null,
  custom_cover: null,
  banner_image: null,
  banner_position: null,
  cover_rotation: 0,
  banner_rotation: 0,
  fetched_at: 1,
  status: 'planning',
  user_rating: null,
  playtime_minutes: 0,
  favorite: false,
  edition_type: 'none',
  physical_location: [],
  dumped: false,
  dumped_ignored: true,
  added_at: 1,
  updated_at: 1,
  series: [],
  egs: null,
  aspect_keys: [],
  has_notes: false,
  list_count: 0,
  in_reading_queue: false,
};

const pagination = { page: 1, page_size: 240, returned: 1, has_more: false };

const relation = {
  id: 'V90002',
  title: 'Related',
  alttitle: null,
  released: null,
  rating: null,
  votecount: null,
  length_minutes: null,
  languages: [],
  platforms: [],
  developers: [],
  image_url: null,
  image_thumb: null,
  image_sexual: null,
  relation: 'seq',
  relation_official: true,
};

const egs = {
  egs_id: 90001,
  median: 80,
  average: 79.5,
  count: 12,
  playtime_median_minutes: 120,
  source: 'manual',
  okazu: false,
  erogame: true,
};

function withoutKeys(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}

describe('collection client response adapters', () => {
  it('decodes library cards, stats, and pagination', () => {
    const decoded = decodeLibraryCollectionResponse({
      items: [card],
      stats: { total: 1, byStatus: [{ status: 'planning', n: 1 }], playtime_minutes: 0 },
      pagination,
    });
    expect(decoded?.items[0]?.id).toBe('v90001');
    expect(decoded?.items[0]?.developers[0]?.id).toBe('p90001');
    expect(decoded?.stats.total).toBe(1);
    expect(decoded?.items[0]?.dumped_ignored).toBe(true);
  });

  it('normalizes VNDB relation summaries that do not expose publishers', () => {
    const decoded = decodeLibraryCollectionResponse({
      items: [{ ...card, relations: [relation] }],
      stats: { total: 1, byStatus: [{ status: 'planning', n: 1 }], playtime_minutes: 0 },
      pagination,
    });
    expect(decoded?.items[0]?.relations[0]?.publishers).toEqual([]);
  });

  it('rejects malformed card rows and page metadata', () => {
    expect(decodeCollectionCardItem({ ...card, cover_rotation: 45 })).toBeNull();
    expect(decodeCollectionCardItem({ ...card, tags: [{ id: 'bad' }] })).toBeNull();
    expect(decodeCollectionCardItem({ ...card, dumped_ignored: 'false' })).toBeNull();
    expect(decodeCollectionPage({ items: [card] }, decodeCollectionCardItem)).toBeNull();
    expect(decodeCollectionPage({ items: [card], pagination: { ...pagination, returned: 2 } }, decodeCollectionCardItem)).toBeNull();
  });

  it('decodes rich and minimal card variants without inventing absent optional fields', () => {
    const rich = decodeCollectionCardItem({
      ...card,
      tags: [
        { id: 'G90001', name: 'Undefined category', rating: 1, spoiler: 0 },
        { id: 'G90002', name: 'Null category', rating: 1, spoiler: 0, category: null, lie: true },
        { id: 'G90003', name: 'Content', rating: 1, spoiler: 0, category: 'cont' },
        { id: 'G90004', name: 'Erotic', rating: 1, spoiler: 0, category: 'ero' },
        { id: 'G90005', name: 'Technical', rating: 1, spoiler: 0, category: 'tech' },
      ],
      relations: [{
        ...relation,
        languages: ['ja'],
        platforms: ['win'],
        developers: [{ name: 'No id' }, { id: 'P90002', name: 'With id' }],
        publishers: [{ name: 'Publisher without id' }, { id: 'P90003', name: 'Publisher with id' }],
      }],
      series: [{ id: 0, name: 'Series' }],
      egs,
      aspect_keys: ['16:9'],
    });
    expect(rich?.relations[0]?.id).toBe('v90002');
    expect(rich?.relations[0]?.developers).toEqual([{ name: 'No id' }, { id: 'p90002', name: 'With id' }]);
    expect(rich?.egs).toEqual(egs);
    expect(rich?.aspect_keys).toEqual(['16:9']);

    const minimal = decodeCollectionCardItem(withoutKeys(card, [
      'status',
      'user_rating',
      'playtime_minutes',
      'favorite',
      'edition_type',
      'physical_location',
      'dumped',
      'dumped_ignored',
      'added_at',
      'updated_at',
      'series',
      'egs',
      'aspect_keys',
    ]));
    expect(minimal).not.toBeNull();
    expect(minimal).not.toHaveProperty('status');
    expect(minimal).not.toHaveProperty('egs');
  });

  it('rejects malformed nested card data at each boundary', () => {
    const invalidCards: Array<Record<string, unknown>> = [
      { ...card, developers: null },
      { ...card, developers: [null] },
      { ...card, developers: [{ id: 1, name: 'Studio' }] },
      { ...card, developers: [{ id: 'bad', name: 'Studio' }] },
      { ...card, developers: [{ id: 'p1', name: null }] },
      { ...card, publishers: null },
      { ...card, tags: null },
      { ...card, tags: [null] },
      { ...card, tags: [{ id: 1, name: 'Tag', rating: 1, spoiler: 0 }] },
      { ...card, tags: [{ id: 'bad', name: 'Tag', rating: 1, spoiler: 0 }] },
      { ...card, tags: [{ id: 'g1', name: null, rating: 1, spoiler: 0 }] },
      { ...card, tags: [{ id: 'g1', name: 'Tag', rating: Number.NaN, spoiler: 0 }] },
      { ...card, tags: [{ id: 'g1', name: 'Tag', rating: 1, spoiler: Number.NaN }] },
      { ...card, tags: [{ id: 'g1', name: 'Tag', rating: 1, spoiler: 0, lie: 'yes' }] },
      { ...card, tags: [{ id: 'g1', name: 'Tag', rating: 1, spoiler: 0, category: 'bad' }] },
      { ...card, relations: null },
      { ...card, series: [null] },
      { ...card, series: [{ id: -1, name: 'Series' }] },
      { ...card, series: [{ id: 1, name: null }] },
      { ...card, egs: { ...egs, source: 'bad' } },
      { ...card, aspect_keys: ['bad'] },
      { ...card, physical_location: [1] },
    ];
    for (const candidate of invalidCards) {
      expect(decodeCollectionCardItem(candidate)).toBeNull();
    }
    expect(decodeCollectionCardItem({ ...card, developers: Array.from({ length: 5_001 }, () => ({ id: 'p1', name: 'Studio' })) })).toBeNull();
  });

  it('rejects malformed relation summaries at each boundary', () => {
    const malformedRelations: unknown[] = [
      null,
      { ...relation, id: 1 },
      { ...relation, id: 'bad' },
      { ...relation, title: null },
      { ...relation, alttitle: 1 },
      { ...relation, released: 1 },
      { ...relation, rating: Number.NaN },
      { ...relation, votecount: Number.NaN },
      { ...relation, length_minutes: Number.NaN },
      { ...relation, languages: [1] },
      { ...relation, platforms: [1] },
      { ...relation, developers: [null] },
      { ...relation, developers: [{ name: null }] },
      { ...relation, developers: [{ name: 'Studio', id: 1 }] },
      { ...relation, publishers: [null] },
      { ...relation, publishers: [{ name: null }] },
      { ...relation, publishers: [{ name: 'Studio', id: 1 }] },
      { ...relation, image_url: 1 },
      { ...relation, image_thumb: 1 },
      { ...relation, image_sexual: Number.NaN },
      { ...relation, relation: null },
      { ...relation, relation_official: null },
    ];
    for (const malformed of malformedRelations) {
      expect(decodeCollectionCardItem({ ...card, relations: [malformed] })).toBeNull();
    }
  });

  it('rejects malformed EGS summaries at each boundary and accepts each known source', () => {
    for (const source of [null, 'extlink', 'search', 'manual']) {
      expect(decodeCollectionCardItem({ ...card, egs: { ...egs, source } })?.egs?.source).toBe(source);
    }
    const malformedEgs: unknown[] = [
      {},
      { ...egs, egs_id: Number.NaN },
      { ...egs, median: Number.NaN },
      { ...egs, average: Number.NaN },
      { ...egs, count: Number.NaN },
      { ...egs, playtime_median_minutes: Number.NaN },
      { ...egs, source: 'bad' },
      { ...egs, okazu: 'false' },
      { ...egs, erogame: 'true' },
    ];
    for (const malformed of malformedEgs) {
      expect(decodeCollectionCardItem({ ...card, egs: malformed })).toBeNull();
    }
  });

  it('rejects malformed scalar card fields at each boundary', () => {
    const malformedFields: Array<[string, unknown]> = [
      ['id', null],
      ['id', 'bad'],
      ['title', null],
      ['alttitle', 1],
      ['image_url', 1],
      ['image_thumb', 1],
      ['image_sexual', Number.NaN],
      ['released', 1],
      ['length_minutes', Number.NaN],
      ['rating', Number.NaN],
      ['local_image', 1],
      ['local_image_thumb', 1],
      ['custom_cover', 1],
      ['banner_image', 1],
      ['banner_position', 1],
      ['banner_rotation', 45],
      ['fetched_at', Number.NaN],
      ['status', 'bad'],
      ['user_rating', Number.NaN],
      ['playtime_minutes', Number.NaN],
      ['favorite', 'false'],
      ['edition_type', 'bad'],
      ['dumped', 'false'],
      ['added_at', Number.NaN],
      ['updated_at', Number.NaN],
      ['has_notes', 'false'],
      ['list_count', -1],
      ['in_reading_queue', 'false'],
    ];
    expect(decodeCollectionCardItem(null)).toBeNull();
    for (const [field, value] of malformedFields) {
      expect(decodeCollectionCardItem({ ...card, [field]: value })).toBeNull();
    }
  });

  it('decodes bounded projections for collection workflows', () => {
    expect(decodeCollectionBulkRow(card)).toEqual({ id: 'v90001', title: 'Title' });
    expect(decodeCollectionCompareRow(card)?.released).toBeNull();
    expect(decodeCollectionSelectiveRow(card)?.status).toBe('planning');
    expect(decodeCollectionSelectiveRow({ ...card, full_downloaded: true })?.full_downloaded).toBe(true);
  });

  it('rejects malformed page, stats, and workflow projections', () => {
    const malformedPages: unknown[] = [
      null,
      { items: null, pagination },
      { items: Array.from({ length: 501 }, () => card), pagination: { ...pagination, returned: 501 } },
      { items: [], pagination: null },
      { items: [], pagination: { ...pagination, page: -1, returned: 0 } },
      { items: [], pagination: { ...pagination, page: 0, returned: 0 } },
      { items: [], pagination: { ...pagination, page_size: -1, returned: 0 } },
      { items: [], pagination: { ...pagination, page_size: 0, returned: 0 } },
      { items: [], pagination: { ...pagination, page_size: 501, returned: 0 } },
      { items: [], pagination: { ...pagination, returned: -1 } },
      { items: [], pagination: { ...pagination, returned: 1 } },
      { items: [], pagination: { ...pagination, returned: 0, has_more: 'false' } },
    ];
    for (const malformed of malformedPages) {
      expect(decodeCollectionPage(malformed, decodeCollectionCardItem)).toBeNull();
    }
    expect(decodeCollectionPage({ items: [null], pagination }, decodeCollectionCardItem)).toBeNull();

    const malformedStats: unknown[] = [
      null,
      { total: -1, byStatus: [], playtime_minutes: 0 },
      { total: 0, byStatus: null, playtime_minutes: 0 },
      { total: 0, byStatus: [null], playtime_minutes: 0 },
      { total: 0, byStatus: [{ status: 1, n: 0 }], playtime_minutes: 0 },
      { total: 0, byStatus: [{ status: 'bad', n: 0 }], playtime_minutes: 0 },
      { total: 0, byStatus: [{ status: 'planning', n: -1 }], playtime_minutes: 0 },
      { total: 0, byStatus: [], playtime_minutes: Number.NaN },
    ];
    for (const stats of malformedStats) {
      expect(decodeLibraryCollectionResponse({ items: [], pagination: { ...pagination, returned: 0 }, stats })).toBeNull();
    }
    expect(decodeLibraryCollectionResponse(null)).toBeNull();

    expect(decodeCollectionBulkRow(null)).toBeNull();
    expect(decodeCollectionBulkRow({ ...card, id: 1 })).toBeNull();
    expect(decodeCollectionBulkRow({ ...card, id: 'bad' })).toBeNull();
    expect(decodeCollectionBulkRow({ ...card, title: null })).toBeNull();
    expect(decodeCollectionCompareRow({ ...card, alttitle: 1 })).toBeNull();
    expect(decodeCollectionCompareRow({ ...card, released: 1 })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, status: 1 })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, rating: Number.NaN })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, user_rating: Number.NaN })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, playtime_minutes: Number.NaN })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, added_at: Number.NaN })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, updated_at: Number.NaN })).toBeNull();
    expect(decodeCollectionSelectiveRow({ ...card, full_downloaded: 'true' })).toBeNull();
  });

  it('decodes compact library facets and defaults', () => {
    expect(decodeLibraryProducerFacets({
      producers: [{ id: 'P90001', name: 'Studio', vn_count: 1 }],
      publishers: [],
    })?.producers[0]?.id).toBe('p90001');
    expect(decodeLibrarySeriesFacets({ series: [{ id: 1, name: 'Series' }] })).toEqual([
      { id: 1, name: 'Series' },
    ]);
    expect(decodeLibraryTagFacets({ tags: [{ id: 'G90001', name: 'Tag', vn_count: 1 }] })).toEqual([
      { id: 'g90001', name: 'Tag', vn_count: 1 },
    ]);
    expect(decodeLibraryDefaults({
      default_sort: 'updated_at',
      default_order: 'desc',
      default_group: 'none',
    })).toEqual({
      default_sort: 'updated_at',
      default_order: 'desc',
      default_group: 'none',
    });
  });

  it('rejects malformed compact facets and defaults', () => {
    const malformedProducerFacets: unknown[] = [
      null,
      { producers: null, publishers: [] },
      { producers: [null], publishers: [] },
      { producers: [{ id: 1, name: 'Studio', vn_count: 1 }], publishers: [] },
      { producers: [{ id: 'bad', name: 'Studio', vn_count: 1 }], publishers: [] },
      { producers: [{ id: 'p1', name: null, vn_count: 1 }], publishers: [] },
      { producers: [{ id: 'p1', name: 'Studio', vn_count: -1 }], publishers: [] },
      { producers: [], publishers: null },
    ];
    for (const malformed of malformedProducerFacets) {
      expect(decodeLibraryProducerFacets(malformed)).toBeNull();
    }

    expect(decodeLibrarySeriesFacets(null)).toBeNull();
    expect(decodeLibrarySeriesFacets({ series: [null] })).toBeNull();
    expect(decodeLibraryTagFacets(null)).toBeNull();
    expect(decodeLibraryTagFacets({ tags: [null] })).toBeNull();
    expect(decodeLibraryTagFacets({ tags: [{ id: 1, name: 'Tag', vn_count: 1 }] })).toBeNull();
    expect(decodeLibraryTagFacets({ tags: [{ id: 'bad', name: 'Tag', vn_count: 1 }] })).toBeNull();
    expect(decodeLibraryTagFacets({ tags: [{ id: 'g1', name: null, vn_count: 1 }] })).toBeNull();
    expect(decodeLibraryTagFacets({ tags: [{ id: 'g1', name: 'Tag', vn_count: -1 }] })).toBeNull();

    expect(decodeLibraryDefaults(null)).toBeNull();
    expect(decodeLibraryDefaults({ default_sort: 1, default_order: 'desc', default_group: 'none' })).toBeNull();
    expect(decodeLibraryDefaults({ default_sort: 'title', default_order: 'bad', default_group: 'none' })).toBeNull();
    expect(decodeLibraryDefaults({ default_sort: 'title', default_order: 'asc', default_group: 1 })).toBeNull();
    expect(decodeLibraryDefaults({ default_sort: 'title', default_order: 'asc', default_group: 'none' })?.default_order).toBe('asc');
  });
});
