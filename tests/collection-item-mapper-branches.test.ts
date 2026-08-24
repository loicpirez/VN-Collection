import { describe, expect, it } from 'vitest';
import {
  mapCollectionItemRow,
  type CollectionItemDatabaseRow,
} from '@/lib/db/collection-item-mapper';

function row(): CollectionItemDatabaseRow {
  return {
    id: 'v90001',
    title: 'Mapper fixture',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: '["ja"]',
    platforms: '[]',
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: '[]',
    publishers: '[]',
    tags: '[]',
    screenshots: '[]',
    release_images: '[]',
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: null,
    banner_rotation: null,
    relations: '[]',
    aliases: '[]',
    extlinks: '[]',
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: '[]',
    editions: '[]',
    staff: '[]',
    va: '[]',
    fetched_at: 1,
  };
}

describe('collection item mapper branch behavior', () => {
  it('returns null when the joined VN row is absent', () => {
    expect(mapCollectionItemRow(undefined)).toBeNull();
  });

  it('replaces a lazy JSON accessor when callers assign a materialized value', () => {
    const item = mapCollectionItemRow(row());
    if (!item) throw new Error('fixture row did not map');

    item.languages = ['en'];

    expect(item.languages).toEqual(['en']);
    expect(Object.keys(item)).toContain('languages');
  });
});
