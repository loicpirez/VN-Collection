import { describe, expect, it } from 'vitest';
import {
  decodeShelfCreateResponse,
  decodeShelfDetailResponse,
  decodeShelfListResponse,
  decodeShelfResizeResponse,
  decodeShelfSlotsResponse,
} from '../src/lib/shelf-client-shape';

const shelf = {
  id: 1,
  name: 'Shelf',
  cols: 2,
  rows: 2,
  order_index: 0,
  created_at: 1,
  updated_at: 2,
};

const item = {
  vn_id: 'v90001',
  release_id: 'r90001',
  vn_title: 'Entry',
  vn_image_thumb: null,
  vn_image_url: null,
  vn_local_image_thumb: null,
  vn_image_sexual: null,
  rel_image_thumb: null,
  rel_image_url: null,
  rel_local_image_thumb: null,
  rel_image_sexual: null,
  edition_label: null,
  box_type: 'none',
  condition: null,
  owned_platform: null,
  physical_location: [],
  price_paid: null,
  currency: null,
  acquired_date: null,
  vn_platforms: [],
  vn_languages: [],
  vn_released: null,
  rel_title: null,
  rel_platforms: [],
  rel_languages: [],
  rel_released: null,
  rel_resolution: null,
  dumped: false,
};

describe('shelf client response adapters', () => {
  it('decodes detail state and derives placed count', () => {
    expect(decodeShelfDetailResponse({
      shelf,
      slots: [{ ...item, shelf_id: 1, row: 0, col: 0 }],
      displays: [{ ...item, shelf_id: 1, after_row: 1, position: 0, placed_at: 3 }],
    })?.shelf.placed_count).toBe(2);
  });

  it('decodes list, create, slot, and resize responses', () => {
    const entry = {
      ...item,
      notes: null,
      location: 'unknown',
      added_at: 3,
      rel_minage: null,
      rel_patch: false,
      rel_freeware: false,
      rel_official: true,
      rel_has_ero: false,
    };
    expect(decodeShelfListResponse({ shelves: [{ ...shelf, placed_count: 0 }], unplaced: [entry] })?.unplaced).toHaveLength(1);
    expect(decodeShelfCreateResponse({ shelf })?.shelf.id).toBe(1);
    expect(decodeShelfSlotsResponse({ slots: [{ ...item, shelf_id: 1, row: 0, col: 0 }] })?.slots).toHaveLength(1);
    expect(decodeShelfResizeResponse({
      shelf,
      slots: [],
      evicted: [{ vn_id: 'EGS_9000001', release_id: 'synthetic:egs_9000001' }],
    })?.evicted).toEqual([{ vn_id: 'egs_9000001', release_id: 'synthetic:egs_9000001' }]);
  });

  it('rejects malformed containers and rows', () => {
    expect(decodeShelfDetailResponse({ shelf, slots: [], displays: null })).toBeNull();
    expect(decodeShelfListResponse({ shelves: [{ ...shelf, placed_count: -1 }] })).toBeNull();
    expect(decodeShelfCreateResponse({ shelf: null })).toBeNull();
    expect(decodeShelfSlotsResponse({ slots: [{ ...item, shelf_id: 1, row: -1, col: 0 }] })).toBeNull();
    expect(decodeShelfResizeResponse({ shelf, slots: [], evicted: [{ vn_id: 'bad', release_id: 'r90001' }] })).toBeNull();
  });
});
