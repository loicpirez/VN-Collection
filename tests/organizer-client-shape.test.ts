import { describe, expect, it } from 'vitest';
import {
  decodeCreatedOrganizerUserList,
  decodeCreatedSeriesId,
  decodeCreatedSeriesRow,
  decodeOrganizerSavedFilters,
  decodeOrganizerUserLists,
  decodeSeriesImagePath,
} from '@/lib/organizer-client-shape';

const LIST = { id: 1, name: 'Favorites', color: null, pinned: 0 };

describe('organizer client response adapters', () => {
  it('decodes list registries, created lists, and saved filters', () => {
    expect(decodeOrganizerUserLists({ lists: [LIST] })).toEqual([LIST]);
    expect(decodeCreatedOrganizerUserList({ list: LIST })).toEqual(LIST);
    expect(decodeOrganizerSavedFilters({
      filters: [{ id: 1, name: 'Recent', params: 'sort=recent', position: 1, created_at: 2 }],
    })?.[0]?.params).toBe('sort=recent');
  });

  it('decodes created series identities and upload paths', () => {
    expect(decodeCreatedSeriesId({ series: { id: 4 } })).toBe(4);
    expect(decodeCreatedSeriesRow({
      series: {
        id: 4,
        name: 'Fixture',
        description: null,
        cover_path: null,
        banner_path: null,
        created_at: 1,
        updated_at: 2,
      },
    })?.name).toBe('Fixture');
    expect(decodeSeriesImagePath({ path: 'series/4-cover.webp' })).toBe('series/4-cover.webp');
    expect(decodeCreatedOrganizerUserList({ list: { ...LIST, color: '#fff', pinned: 1 } })).toEqual({
      ...LIST,
      color: '#fff',
      pinned: 1,
    });
    expect(decodeCreatedSeriesRow({
      series: {
        id: 5,
        name: 'Fixture',
        description: 'Description',
        cover_path: 'series/5-cover.webp',
        banner_path: 'series/5-banner.webp',
        created_at: 1,
        updated_at: 2,
      },
    })?.banner_path).toBe('series/5-banner.webp');
  });

  it('rejects malformed organizer payloads', () => {
    expect(decodeOrganizerUserLists({ lists: Array(2_001).fill(LIST) })).toBeNull();
    expect(decodeOrganizerUserLists({ lists: [{ ...LIST, pinned: 2 }] })).toBeNull();
    expect(decodeOrganizerSavedFilters({ filters: Array(501).fill(null) })).toBeNull();
    expect(decodeOrganizerSavedFilters({ filters: [{ id: 0 }] })).toBeNull();
    expect(decodeCreatedSeriesId({ series: { id: 0 } })).toBeNull();
    expect(decodeCreatedSeriesRow({ series: { id: 4 } })).toBeNull();
    expect(decodeSeriesImagePath({ path: '../secret' })).toBeNull();
    expect(decodeSeriesImagePath({ path: '' })).toBeNull();
    expect(decodeSeriesImagePath({ path: 'a'.repeat(201) })).toBeNull();
    expect(decodeSeriesImagePath({ path: 'series/\0cover.webp' })).toBeNull();
    expect(decodeSeriesImagePath({ path: 'series/cover image.webp' })).toBeNull();
  });
});
