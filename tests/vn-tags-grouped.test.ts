/**
 * Pin the sorting / spoiler-filtering / category-grouping / summary-
 * vs-all behaviour of the VN tag overhaul. No React, no DOM — the
 * helper under test is a pure function so the assertions stay on the
 * logic the UI relies on.
 *
 * Synthetic ids / names only.
 */
import { describe, expect, it } from 'vitest';
import { filterAndGroupTags, tagLinks, type RawVnTag } from '@/lib/vn-tags-grouped';

function tag(o: Partial<RawVnTag> & { id: string }): RawVnTag {
  return {
    id: o.id,
    name: o.name ?? o.id,
    rating: o.rating ?? 2,
    spoiler: o.spoiler ?? 0,
    lie: o.lie ?? false,
    category: o.category ?? 'cont',
  };
}

describe('filterAndGroupTags', () => {
  it('sorts every category by rating descending', () => {
    const result = filterAndGroupTags(
      [
        tag({ id: 'g1', rating: 1.5, category: 'cont' }),
        tag({ id: 'g2', rating: 2.9, category: 'cont' }),
        tag({ id: 'g3', rating: 2.0, category: 'tech' }),
      ],
      { spoilerMode: 'all', view: 'all' },
    );
    expect(result.cont.map((t) => t.id)).toEqual(['g2', 'g1']);
    expect(result.tech.map((t) => t.id)).toEqual(['g3']);
    expect(result.ero).toEqual([]);
  });

  it('groups by VNDB category with `cont` as default for missing category', () => {
    const result = filterAndGroupTags(
      [
        tag({ id: 'g1', category: 'cont' }),
        tag({ id: 'g2', category: 'ero' }),
        tag({ id: 'g3', category: 'tech' }),
        tag({ id: 'g4', category: null }),
      ],
      { spoilerMode: 'all', view: 'all' },
    );
    expect(result.cont.map((t) => t.id).sort()).toEqual(['g1', 'g4']);
    expect(result.ero.map((t) => t.id)).toEqual(['g2']);
    expect(result.tech.map((t) => t.id)).toEqual(['g3']);
  });

  it('spoiler=none drops anything with spoiler > 0', () => {
    const result = filterAndGroupTags(
      [
        tag({ id: 'g1', spoiler: 0 }),
        tag({ id: 'g2', spoiler: 1 }),
        tag({ id: 'g3', spoiler: 2 }),
      ],
      { spoilerMode: 'none', view: 'all' },
    );
    expect(result.cont.map((t) => t.id)).toEqual(['g1']);
  });

  it('spoiler=minor keeps spoiler 0+1 but drops 2', () => {
    const result = filterAndGroupTags(
      [
        tag({ id: 'g1', spoiler: 0 }),
        tag({ id: 'g2', spoiler: 1 }),
        tag({ id: 'g3', spoiler: 2 }),
      ],
      { spoilerMode: 'minor', view: 'all' },
    );
    expect(result.cont.map((t) => t.id).sort()).toEqual(['g1', 'g2']);
  });

  it('spoiler=all keeps every tag (UI then blurs spoiler-2)', () => {
    const result = filterAndGroupTags(
      [
        tag({ id: 'g1', spoiler: 0 }),
        tag({ id: 'g2', spoiler: 2 }),
      ],
      { spoilerMode: 'all', view: 'all' },
    );
    expect(result.cont.length).toBe(2);
  });

  it('summary view keeps only the top-12 tags by rating, AFTER spoiler filtering', () => {
    const many: RawVnTag[] = Array.from({ length: 30 }, (_, i) =>
      tag({ id: `g${i + 1}`, rating: 3 - i * 0.05, category: 'cont' }),
    );
    const result = filterAndGroupTags(many, { spoilerMode: 'all', view: 'summary' });
    expect(result.cont.length).toBe(12);
    // Top-rated row preserved.
    expect(result.cont[0]?.id).toBe('g1');
  });
});

describe('tagLinks', () => {
  it('exposes the library, tag-page, and external VNDB hrefs', () => {
    const l = tagLinks('g9001');
    expect(l.libraryHref).toBe('/?tag=g9001');
    expect(l.tagPageHref).toBe('/tag/g9001');
    expect(l.vndbExternal).toBe('https://vndb.org/g9001');
  });

  it('lowercases the id for the link components', () => {
    const l = tagLinks('G9002');
    expect(l.libraryHref).toBe('/?tag=g9002');
    expect(l.vndbExternal).toBe('https://vndb.org/g9002');
  });
});
