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
});
