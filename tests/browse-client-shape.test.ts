import { describe, expect, it } from 'vitest';
import {
  decodeTagHomeTreeResponse,
  decodeTagsResponse,
  decodeTextualSearchHits,
  decodeTraitsResponse,
} from '@/lib/browse-client-shape';

const tag = {
  id: 'G90001',
  name: 'Fixture tag',
  aliases: ['Alias'],
  description: null,
  category: 'cont',
  searchable: true,
  applicable: true,
  vn_count: 4,
};

const trait = {
  id: 'I90001',
  name: 'Fixture trait',
  aliases: [],
  description: null,
  searchable: true,
  applicable: true,
  sexual: false,
  group_id: 'I90000',
  group_name: 'Group',
  char_count: 5,
};

describe('browse client response adapters', () => {
  it('decodes textual hits and flat tag or trait rows', () => {
    expect(decodeTextualSearchHits({
      hits: [{ vn_id: 'V90001', title: 'Fixture', source: 'notes', snippet: 'Excerpt' }],
    })).toEqual([{ vn_id: 'v90001', title: 'Fixture', source: 'notes', snippet: 'Excerpt' }]);
    expect(decodeTagsResponse({ tags: [tag] })?.[0]?.id).toBe('g90001');
    expect(decodeTraitsResponse({ traits: [trait] })?.[0]).toMatchObject({
      id: 'i90001',
      group_id: 'i90000',
    });
  });

  it('decodes a bounded scraped tag hierarchy', () => {
    expect(decodeTagHomeTreeResponse({
      data: {
        groups: [{
          id: 'G1',
          label: 'Content',
          href: '/tag/g1?tab=vndb',
          children: [{
            id: 'G2',
            name: 'Child',
            href: '/tag/g2?tab=vndb',
            count: 3,
            children: [],
          }],
        }],
        recentlyAdded: [{ id: 'G3', name: 'Recent', href: '/tag/g3?tab=vndb', dateLabel: null }],
        popular: [{ id: 'G4', name: 'Popular', href: '/tag/g4?tab=vndb', count: 8 }],
        recentlyTaggedHref: '/g/links',
      },
      fetched_at: 12,
      stale: false,
      source_url: 'https://vndb.org/g',
      warning: 'cached',
    })).toEqual({
      data: {
        groups: [{
          id: 'g1',
          label: 'Content',
          href: '/tag/g1?tab=vndb',
          children: [{
            id: 'g2',
            name: 'Child',
            href: '/tag/g2?tab=vndb',
            count: 3,
            children: [],
          }],
        }],
        recentlyAdded: [{ id: 'g3', name: 'Recent', href: '/tag/g3?tab=vndb', dateLabel: null }],
        popular: [{ id: 'g4', name: 'Popular', href: '/tag/g4?tab=vndb', count: 8 }],
        recentlyTaggedHref: '/g/links',
      },
      warning: 'cached',
    });
  });

  it('rejects malformed browse payloads', () => {
    expect(decodeTextualSearchHits({ hits: [{ vn_id: 'bad', title: 'x', source: 'notes', snippet: 'x' }] })).toBeNull();
    expect(decodeTagsResponse({ tags: [{ ...tag, category: 'bad' }] })).toBeNull();
    expect(decodeTraitsResponse({ traits: [{ ...trait, char_count: -1 }] })).toBeNull();
    expect(decodeTagHomeTreeResponse({
      data: { groups: [{ id: 'g1', label: 'x', href: '/wrong', children: [] }], recentlyAdded: [], popular: [] },
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    })).toBeNull();
  });
});
