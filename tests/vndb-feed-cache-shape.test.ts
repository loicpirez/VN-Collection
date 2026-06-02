import { describe, expect, it } from 'vitest';
import {
  decodeProducerAssociationReleasePage,
  decodeProducerAssociationVnPage,
  decodeProducerCompletionResults,
  decodeRecommendationResults,
  decodeSteamReleaseResults,
  decodeUpcomingReleasePage,
  decodeVndbTopRankedPage,
} from '@/lib/vndb-feed-cache-shape';

function topRankedRow() {
  return {
    id: 'V990101',
    title: 'Synthetic ranked VN',
    alttitle: null,
    released: '2099-01-01',
    image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg', sexual: 0 },
    rating: 85,
    votecount: 50,
    length_minutes: 600,
    languages: ['ja'],
    platforms: ['win'],
    developers: [{ id: 'P990101', name: 'Studio X' }, { id: 'invalid', name: 'Ignored' }],
  };
}

function upcomingRow() {
  return {
    id: 'R990102',
    title: 'Synthetic upcoming release',
    alttitle: null,
    released: '2099-02-01',
    languages: [{ lang: 'ja' }, 'en', { missing: 'lang' }],
    platforms: ['win'],
    producers: [{ id: 'P990102', name: 'Studio X' }, { id: 'invalid', name: 'Ignored' }],
    vns: [
      {
        id: 'V990102',
        title: 'Synthetic upcoming VN',
        image: { url: 'https://example.invalid/vn.jpg' },
      },
      { id: 'invalid', title: 'Ignored', image: null },
    ],
    patch: false,
    freeware: false,
    has_ero: true,
  };
}

describe('VNDB feed cache shape decoders', () => {
  it('normalizes top-ranked ids and filters malformed nested developers', () => {
    expect(decodeVndbTopRankedPage({ results: [topRankedRow()], more: true })).toEqual({
      results: [{
        ...topRankedRow(),
        id: 'v990101',
        developers: [{ id: 'p990101', name: 'Studio X' }],
      }],
      more: true,
    });
  });

  it('rejects malformed top-ranked envelopes and required row fields', () => {
    expect(decodeVndbTopRankedPage({ results: {}, more: false })).toBeNull();
    expect(decodeVndbTopRankedPage({ results: [{ ...topRankedRow(), platforms: {} }], more: false })).toEqual({
      results: [],
      more: false,
    });
    expect(decodeVndbTopRankedPage({ results: [null], more: false })).toEqual({ results: [], more: false });
    expect(decodeVndbTopRankedPage({
      results: [{ ...topRankedRow(), image: { url: 4 } }],
      more: false,
    })).toEqual({ results: [], more: false });
    expect(decodeVndbTopRankedPage({
      results: [{ ...topRankedRow(), id: 4 }],
      more: false,
    })).toEqual({ results: [], more: false });
  });

  it('accepts sparse top-ranked image metadata and ignores malformed developers', () => {
    expect(decodeVndbTopRankedPage({
      results: [{
        ...topRankedRow(),
        image: { url: 'https://example.invalid/cover.jpg' },
        developers: [null],
      }],
      more: false,
    })?.results[0]).toMatchObject({
      image: { url: 'https://example.invalid/cover.jpg' },
      developers: [],
    });
  });

  it('normalizes upcoming release language rows into codes', () => {
    expect(decodeUpcomingReleasePage({ results: [upcomingRow()], more: false })).toEqual({
      results: [{
        ...upcomingRow(),
        id: 'r990102',
        languages: ['ja', 'en'],
        producers: [{ id: 'p990102', name: 'Studio X' }],
        vns: [{
          id: 'v990102',
          title: 'Synthetic upcoming VN',
          image: { url: 'https://example.invalid/vn.jpg' },
        }],
      }],
      more: false,
    });
  });

  it('rejects malformed upcoming envelopes and oversized pages', () => {
    expect(decodeUpcomingReleasePage({ results: [], more: 'false' })).toBeNull();
    expect(decodeUpcomingReleasePage({ results: new Array(1001).fill(upcomingRow()), more: false })).toBeNull();
    expect(decodeUpcomingReleasePage({ results: [null], more: false })).toEqual({ results: [], more: false });
    expect(decodeUpcomingReleasePage({
      results: [{ ...upcomingRow(), languages: {} }],
      more: false,
    })).toEqual({ results: [], more: false });
    expect(decodeUpcomingReleasePage({
      results: [{ ...upcomingRow(), id: 4 }],
      more: false,
    })).toEqual({ results: [], more: false });
  });

  it('keeps null upcoming VN images and drops malformed nested VN images', () => {
    expect(decodeUpcomingReleasePage({
      results: [{
      ...upcomingRow(),
      producers: [null],
      vns: [
        { id: 'v990102', title: 'Synthetic upcoming VN', image: null },
        { id: 'v990103', title: 'Malformed image', image: { url: 4 } },
        null,
      ],
      }],
      more: false,
    })?.results[0]?.vns).toEqual([{
      id: 'v990102',
      title: 'Synthetic upcoming VN',
      image: null,
    }]);
  });

  it('decodes recommendation and producer-completion summaries', () => {
    const recommendation = {
      id: 'V990103',
      title: 'Synthetic recommendation',
      alttitle: null,
      released: null,
      rating: 75,
      votecount: 20,
      length_minutes: 300,
      image: null,
      developers: [{ id: 'P990103', name: 'Studio X' }],
    };
    expect(decodeRecommendationResults({ results: [recommendation] })).toEqual({
      results: [{ ...recommendation, id: 'v990103', developers: [{ id: 'p990103', name: 'Studio X' }] }],
    });
    expect(decodeProducerCompletionResults({
      results: [{
        id: 'V990104',
        title: 'Synthetic completion row',
        alttitle: null,
        released: null,
        rating: null,
        image: null,
      }],
    })).toEqual({
      results: [{
        id: 'v990104',
        title: 'Synthetic completion row',
        alttitle: null,
        released: null,
        rating: null,
        image: null,
      }],
    });
    expect(decodeRecommendationResults({
      results: [{
        ...recommendation,
        image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
      }],
    })?.results[0]?.image).toEqual({
      url: 'https://example.invalid/cover.jpg',
      thumbnail: 'https://example.invalid/thumb.jpg',
    });
    expect(decodeProducerCompletionResults({
      results: [{
        id: 'v990104',
        title: 'Synthetic completion row',
        alttitle: null,
        released: null,
        rating: null,
        image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
      }],
    })?.results[0]?.image).toEqual({
      url: 'https://example.invalid/cover.jpg',
      thumbnail: 'https://example.invalid/thumb.jpg',
    });
  });

  it('filters malformed recommendation and completion rows and validates result envelopes', () => {
    expect(decodeRecommendationResults(null)).toBeNull();
    expect(decodeRecommendationResults({ results: new Array(1001).fill(null) })).toBeNull();
    expect(decodeRecommendationResults({
      results: [null, {
        id: 'v990103',
        title: 'Synthetic recommendation',
        alttitle: null,
        released: null,
        rating: null,
        votecount: null,
        length_minutes: null,
        image: { url: 'x' },
        developers: [],
      }],
    })).toEqual({ results: [] });
    expect(decodeRecommendationResults({
      results: [{ ...topRankedRow(), id: 4 }, { ...topRankedRow(), developers: {} }],
    })).toEqual({ results: [] });
    expect(decodeProducerCompletionResults({
      results: [null, {
        id: 'v990104',
        title: 'Synthetic completion row',
        alttitle: null,
        released: null,
        rating: null,
        image: { url: 'x' },
      }],
    })).toEqual({ results: [] });
    expect(decodeProducerCompletionResults({
      results: [{ id: 4, title: 'Invalid', alttitle: null, released: null, rating: null, image: null }],
    })).toEqual({ results: [] });
  });

  it('decodes producer association VN and release pages', () => {
    expect(decodeProducerAssociationVnPage({
      results: [{ id: 'V990105', title: 'Synthetic developer VN', image: null }],
      more: false,
    })).toEqual({
      results: [{ id: 'v990105', title: 'Synthetic developer VN', image: null }],
      more: false,
    });
    expect(decodeProducerAssociationReleasePage({
      results: [{
        id: 'R990105',
        vns: [{ id: 'V990106', title: 'Synthetic publisher VN', image: null }],
        producers: [{ id: 'P990105', developer: false, publisher: true, name: 'Studio X' }],
      }],
      more: false,
    })).toEqual({
      results: [{
        id: 'r990105',
        vns: [{ id: 'v990106', title: 'Synthetic publisher VN', image: null }],
        producers: [{ id: 'p990105', developer: false, publisher: true, name: 'Studio X' }],
      }],
      more: false,
    });
  });

  it('preserves sparse association rows and filters malformed nested members', () => {
    expect(decodeProducerAssociationVnPage({
      results: [{
        id: 'v990105',
        title: 'Synthetic developer VN',
      }, {
        id: 'v990106',
        title: 'Full developer VN',
        alttitle: null,
        released: null,
        rating: null,
        image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
      }, {
        id: 4,
        title: 'Invalid id',
      }, {
        id: 'v990107',
        title: 'Missing thumbnail',
        image: { url: 'https://example.invalid/cover.jpg' },
      }, null],
      more: false,
    })?.results).toEqual([
      { id: 'v990105', title: 'Synthetic developer VN' },
      {
        id: 'v990106',
        title: 'Full developer VN',
        alttitle: null,
        released: null,
        rating: null,
        image: { url: 'https://example.invalid/cover.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
      },
    ]);
    expect(decodeProducerAssociationReleasePage({
      results: [{
        id: 'r990105',
        vns: [null],
        producers: [
          { id: 'p990105', developer: true, publisher: false },
          { id: 'bad', developer: true, publisher: false },
          null,
        ],
      }, null],
      more: false,
    })?.results).toEqual([{
      id: 'r990105',
      vns: [],
      producers: [{ id: 'p990105', developer: true, publisher: false }],
    }]);
  });

  it('decodes Steam release links and filters malformed nested members', () => {
    expect(decodeSteamReleaseResults({
      results: [{
        title: 'Synthetic Steam release',
        extlinks: [
          { url: 'https://store.steampowered.com/app/990107', name: 'steam', id: 990107 },
          { url: 42, name: 'invalid' },
        ],
        vns: [{ id: 'V990107' }, { id: 'invalid' }],
      }],
    })).toEqual({
      results: [{
        title: 'Synthetic Steam release',
        extlinks: [{ url: 'https://store.steampowered.com/app/990107', name: 'steam', id: 990107 }],
        vns: [{ id: 'v990107' }],
      }],
    });
  });

  it('preserves Steam extlinks without ids and filters malformed Steam rows', () => {
    expect(decodeSteamReleaseResults({
      results: [{
        title: 'Synthetic Steam release',
        extlinks: [
          { url: 'https://example.invalid/store', name: 'store' },
          { url: 'https://example.invalid/store-2', name: 'store', id: 'sku' },
          { url: 'https://example.invalid/store-3', name: 'store', id: {} },
        ],
        vns: [null],
      }, null],
    })).toEqual({
      results: [{
        title: 'Synthetic Steam release',
        extlinks: [
          { url: 'https://example.invalid/store', name: 'store' },
          { url: 'https://example.invalid/store-2', name: 'store', id: 'sku' },
        ],
        vns: [],
      }],
    });
  });
});
