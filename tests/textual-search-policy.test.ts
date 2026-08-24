import { describe, expect, it } from 'vitest';
import { hasEnoughStrongLocalMatches, TEXTUAL_SEARCH_LOCAL_MATCH_THRESHOLD } from '@/lib/textual-search-policy';
import type { CollectionFindMatch } from '@/lib/collection-find-client-shape';

function match(index: number, title: string, alttitle: string | null = null): CollectionFindMatch {
  return {
    id: `v${90000 + index}`,
    title,
    alttitle,
    image_url: null,
    image_thumb: null,
    local_image: null,
    local_image_thumb: null,
    image_sexual: null,
  };
}

describe('textual search request policy', () => {
  it('requires a non-empty query and the full strong-match threshold', () => {
    const almostEnough = Array.from(
      { length: TEXTUAL_SEARCH_LOCAL_MATCH_THRESHOLD - 1 },
      (_value, index) => match(index, `Canvas ${index}`),
    );
    expect(hasEnoughStrongLocalMatches('  ', almostEnough)).toBe(false);
    expect(hasEnoughStrongLocalMatches('canvas', almostEnough)).toBe(false);
    expect(hasEnoughStrongLocalMatches('canvas', [
      ...almostEnough,
      match(10, 'Unrelated title'),
    ])).toBe(false);
  });

  it('accepts normalized primary and alternate exact or prefix matches', () => {
    const matches = [
      match(1, 'ＣＡＮＶＡＳ'),
      match(2, 'Canvas 2'),
      match(3, 'Other', 'Canvas 3'),
      match(4, 'Other', 'Canvas'),
      match(5, 'canvas four'),
      match(6, '  Canvas Five  '),
    ];
    expect(hasEnoughStrongLocalMatches('canvas', matches)).toBe(true);
  });
});
