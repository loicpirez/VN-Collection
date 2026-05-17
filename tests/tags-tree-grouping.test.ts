/**
 * Pin the contract for the `/tags` tree explorer's grouping helper.
 *
 * `groupTagsByCategory(list, query?)` is the pure helper that powers
 * the per-category sections in `<TagTreeExplorer>`. The renderer
 * relies on three invariants:
 *
 *  - Categories appear in `TAG_CATEGORY_ORDER` ("cont" / "ero" /
 *    "tech"), always, regardless of input order.
 *  - Unknown categories collapse into an `other` bucket so a fresh
 *    VNDB enum doesn't drop tags silently.
 *  - The optional `query` parameter applies a case-insensitive
 *    substring filter against name + aliases.
 *
 * Test fixtures use synthetic ids (`g9xxxx`) per the repo style
 * guide; no real VNDB tag names appear in the suite.
 */
import { describe, expect, it } from 'vitest';
import {
  groupTagsByCategory,
  TAG_CATEGORY_ORDER,
  vndbTagExternalHref,
} from '@/lib/tags-page-modes';

interface FixtureTag {
  id: string;
  name: string;
  category?: string | null;
  aliases?: string[];
}

const fixture: FixtureTag[] = [
  { id: 'g9001', name: 'placeholder-cont-1', category: 'cont', aliases: ['cont-alias'] },
  { id: 'g9002', name: 'placeholder-ero-1', category: 'ero', aliases: [] },
  { id: 'g9003', name: 'placeholder-tech-1', category: 'tech', aliases: [] },
  { id: 'g9004', name: 'placeholder-cont-2', category: 'cont', aliases: [] },
  { id: 'g9005', name: 'placeholder-mystery', category: 'unknown', aliases: [] },
  { id: 'g9006', name: 'placeholder-uncat', category: null, aliases: [] },
];

describe('groupTagsByCategory', () => {
  it('emits buckets in canonical category order with the `other` bucket last', () => {
    const buckets = groupTagsByCategory(fixture);
    expect(buckets.map((b) => b.category)).toEqual(['cont', 'ero', 'tech', 'other']);
  });

  it('preserves the input order within each bucket', () => {
    const buckets = groupTagsByCategory(fixture);
    expect(buckets[0].tags.map((t) => t.id)).toEqual(['g9001', 'g9004']);
  });

  it('drops empty buckets', () => {
    const onlyCont = fixture.filter((t) => t.category === 'cont');
    const buckets = groupTagsByCategory(onlyCont);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].category).toBe('cont');
  });

  it('applies the optional query as a case-insensitive substring filter', () => {
    const buckets = groupTagsByCategory(fixture, 'CONT-ALIAS');
    // Only the tag with that alias survives, and it's in `cont`.
    expect(buckets).toEqual([{ category: 'cont', tags: [fixture[0]] }]);
  });

  it('collapses null / unknown categories into `other`', () => {
    const buckets = groupTagsByCategory(fixture);
    const other = buckets.find((b) => b.category === 'other');
    expect(other?.tags.map((t) => t.id).sort()).toEqual(['g9005', 'g9006']);
  });

  it('emits the canonical category order constant in the documented order', () => {
    expect([...TAG_CATEGORY_ORDER]).toEqual(['cont', 'ero', 'tech']);
  });

  it('returns an empty array when the query matches nothing', () => {
    expect(groupTagsByCategory(fixture, 'unmatchable-needle')).toEqual([]);
  });
});

describe('vndbTagExternalHref', () => {
  it('lowercases the id and points at vndb.org', () => {
    expect(vndbTagExternalHref('G9001')).toBe('https://vndb.org/g9001');
  });
});
