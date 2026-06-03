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

  it('decodes optional flat and hierarchy fields when they are omitted or null', () => {
    expect(decodeTraitsResponse({ traits: [{ ...trait, group_id: null }] })?.[0]?.group_id).toBeNull();
    expect(decodeTagHomeTreeResponse({
      data: {
        groups: [{
          id: 'g10',
          label: 'Group',
          href: '/tag/g10?tab=vndb',
          moreCount: 2,
          children: [{
            id: 'g11',
            name: 'Child',
            href: '/tag/g11?tab=vndb',
            moreCount: null,
            children: [{ id: 'g12', name: 'Grandchild', href: '/tag/g12?tab=vndb' }],
          }],
        }],
        recentlyAdded: [],
        popular: [],
      },
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    })).toEqual({
      data: {
        groups: [{
          id: 'g10',
          label: 'Group',
          href: '/tag/g10?tab=vndb',
          moreCount: 2,
          children: [{
            id: 'g11',
            name: 'Child',
            href: '/tag/g11?tab=vndb',
            moreCount: null,
            children: [{ id: 'g12', name: 'Grandchild', href: '/tag/g12?tab=vndb' }],
          }],
        }],
        recentlyAdded: [],
        popular: [],
      },
      warning: null,
    });
  });

  it('accepts every textual source and rejects malformed textual envelopes', () => {
    expect(decodeTextualSearchHits({
      hits: [
        { vn_id: 'v90002', title: 'Fixture', source: 'custom_description', snippet: 'Description' },
        { vn_id: 'egs_90003', title: 'Fixture', source: 'quote', snippet: 'Quote' },
      ],
    })).toHaveLength(2);
    expect(decodeTextualSearchHits({ hits: null })).toBeNull();
    expect(decodeTextualSearchHits({ hits: Array.from({ length: 51 }, () => null) })).toBeNull();
    expect(decodeTextualSearchHits({ hits: [{ vn_id: 'v90002', title: 'Fixture', source: 'bad', snippet: 'x' }] })).toBeNull();
  });

  it('rejects malformed and oversized flat arrays', () => {
    expect(decodeTagsResponse({ tags: null })).toBeNull();
    expect(decodeTraitsResponse({ traits: null })).toBeNull();
    expect(decodeTagsResponse({ tags: Array.from({ length: 500 }, () => tag) })).toHaveLength(500);
    expect(decodeTraitsResponse({ traits: Array.from({ length: 500 }, () => trait) })).toHaveLength(500);
    expect(decodeTagsResponse({ tags: Array.from({ length: 10001 }, () => tag) })).toBeNull();
    expect(decodeTraitsResponse({ traits: Array.from({ length: 10001 }, () => trait) })).toBeNull();
    expect(decodeTagsResponse({ tags: [{ ...tag, aliases: null }] })).toBeNull();
  });

  it('rejects malformed hierarchy envelopes and invalid nested children', () => {
    expect(decodeTagHomeTreeResponse(null)).toBeNull();
    expect(decodeTagHomeTreeResponse({
      data: {
        groups: [{
          id: 'g20',
          label: 'Group',
          href: '/tag/g20?tab=vndb',
          children: [{
            id: 'g21',
            name: 'Child',
            href: '/tag/g21?tab=vndb',
            children: [{ id: 'bad', name: 'Bad', href: '/tag/bad?tab=vndb' }],
          }],
        }],
        recentlyAdded: [],
        popular: [],
      },
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    })).toBeNull();
  });

  it('rejects hierarchy nodes deeper than the supported recursive budget', () => {
    let nested: Record<string, unknown> = { id: 'g39', name: 'Deep', href: '/tag/g39?tab=vndb' };
    for (let id = 38; id >= 30; id -= 1) {
      nested = { id: `g${id}`, name: 'Deep', href: `/tag/g${id}?tab=vndb`, children: [nested] };
    }
    expect(decodeTagHomeTreeResponse({
      data: {
        groups: [{ id: 'g29', label: 'Group', href: '/tag/g29?tab=vndb', children: [nested] }],
        recentlyAdded: [],
        popular: [],
      },
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    })).toBeNull();
  });

  it('rejects hierarchy lists that exceed the shared row budget', () => {
    const rows = Array.from({ length: 10_001 }, (_, index) => ({
      id: `g${40_000 + index}`,
      name: 'Row',
      href: `/tag/g${40_000 + index}?tab=vndb`,
    }));
    expect(decodeTagHomeTreeResponse({
      data: { groups: [], recentlyAdded: rows, popular: [] },
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    })).toBeNull();
  });

  it('rejects malformed recently-added and popular hierarchy rows', () => {
    const base = {
      fetched_at: 1,
      stale: false,
      source_url: 'https://vndb.org/g',
    };
    expect(decodeTagHomeTreeResponse({
      ...base,
      data: { groups: [], recentlyAdded: [{ id: 'bad', name: 'Bad', href: '/bad' }], popular: [] },
    })).toBeNull();
    expect(decodeTagHomeTreeResponse({
      ...base,
      data: { groups: [], recentlyAdded: [], popular: [{ id: 'bad', name: 'Bad', href: '/bad' }] },
    })).toBeNull();
  });
});
