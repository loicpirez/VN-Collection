import { describe, expect, it } from 'vitest';
import { toCardData } from '@/components/cardData';
import type { CollectionCardItem } from '@/lib/types';

function makeRow(overrides: Partial<CollectionCardItem> = {}): CollectionCardItem {
  return {
    id: 'v90001',
    title: 'Synthetic title',
    alttitle: null,
    image_url: null,
    image_thumb: 'https://img.test/thumb.jpg',
    image_sexual: 0,
    released: '2024-01-02',
    length_minutes: 420,
    rating: 72,
    developers: [{ id: 'p90001', name: 'Studio A' }],
    publishers: [{ id: 'p90002', name: 'Publisher A' }],
    tags: [],
    relations: [],
    local_image: null,
    local_image_thumb: 'storage/thumb.jpg',
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    fetched_at: 1,
    ...overrides,
  };
}

describe('toCardData', () => {
  it('projects fallback artwork and default collection metadata', () => {
    const row = makeRow();
    const data = toCardData(row);

    expect(data).toMatchObject({
      id: 'v90001',
      title: 'Synthetic title',
      poster: 'https://img.test/thumb.jpg',
      localPoster: 'storage/thumb.jpg',
      egs_median: null,
      egs_playtime_minutes: null,
      status: undefined,
      listCount: 0,
      inCollectionBadge: false,
      isFanDisc: false,
    });
  });

  it('keeps the same projected object for the same row identity', () => {
    const row = makeRow();

    expect(toCardData(row)).toBe(toCardData(row));
  });

  it('handles rows without relation metadata', () => {
    const data = toCardData(makeRow({ relations: undefined }));

    expect(data.isFanDisc).toBe(false);
  });

  it('projects collection, EGS, artwork priority, and fan-disc fields', () => {
    const row = makeRow({
      image_url: 'https://img.test/full.jpg',
      local_image: 'storage/full.jpg',
      custom_cover: 'storage/custom.jpg',
      image_sexual: 2,
      egs: {
        egs_id: 90001,
        median: 81,
        average: 79,
        count: 25,
        playtime_median_minutes: 960,
        source: 'manual',
        okazu: false,
        erogame: true,
      },
      status: 'completed',
      user_rating: 9,
      playtime_minutes: 980,
      edition_type: 'limited',
      aspect_keys: ['16:9', 'unknown'],
      favorite: true,
      in_reading_queue: true,
      list_count: 3,
      relations: [
        {
          id: 'v90002',
          title: 'Original synthetic title',
          alttitle: null,
          released: null,
          rating: null,
          votecount: null,
          length_minutes: null,
          languages: [],
          platforms: [],
          developers: [],
          publishers: [],
          image_url: null,
          image_thumb: null,
          image_sexual: null,
          relation: 'orig',
          relation_official: true,
        },
      ],
    });

    expect(toCardData(row)).toMatchObject({
      poster: 'https://img.test/full.jpg',
      localPoster: 'storage/full.jpg',
      customCover: 'storage/custom.jpg',
      sexual: 2,
      egs_median: 81,
      egs_playtime_minutes: 960,
      status: 'completed',
      user_rating: 9,
      playtime_minutes: 980,
      editionType: 'limited',
      aspectKeys: ['16:9', 'unknown'],
      favorite: true,
      inReadingQueue: true,
      listCount: 3,
      inCollectionBadge: true,
      isFanDisc: true,
    });
  });
});
