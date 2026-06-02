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
    const relation = {
      id: 'v90002',
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

  it('decodes bounded projections for collection workflows', () => {
    expect(decodeCollectionBulkRow(card)).toEqual({ id: 'v90001', title: 'Title' });
    expect(decodeCollectionCompareRow(card)?.released).toBeNull();
    expect(decodeCollectionSelectiveRow(card)?.status).toBe('planning');
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
});
