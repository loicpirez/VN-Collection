/**
 * TESTA-014 — bounded title-query generation in src/lib/stock-query.ts.
 *
 * `titleQueries` builds a de-duplicated search set from a VN's title,
 * alttitle, caller-supplied extra terms, and every per-language title
 * entry, capped at 5 items, dropping sub-2-char / whitespace-only
 * values, and de-duplicating case-insensitively. `titleQueriesForProvider`
 * narrows the set to Japanese-script queries (sliced to 3) for amazon_jp.
 * `amazonSearchTerms` returns the bare query plus a `PCゲーム`-qualified
 * variant with no duplicates.
 */
import { describe, expect, it } from 'vitest';
import { amazonSearchTerms, titleQueries, titleQueriesForProvider } from '@/lib/stock-query';
import type { CollectionItem } from '@/lib/types';

type TitleEntry = NonNullable<CollectionItem['titles']>[number];

function titleEntry(title: string, latin: string | null = null): TitleEntry {
  return { lang: 'ja', title, latin, official: true, main: false };
}

function makeVn(fields: Partial<CollectionItem>): CollectionItem {
  return {
    title: '',
    alttitle: null,
    titles: [],
    ...fields,
  } as CollectionItem;
}

describe('titleQueries', () => {
  it('caps the output at 5 entries', () => {
    const vn = makeVn({
      title: 'alpha',
      alttitle: 'bravo',
      titles: [
        titleEntry('charlie'),
        titleEntry('delta'),
        titleEntry('echo'),
        titleEntry('foxtrot'),
        titleEntry('golf'),
      ],
    });
    const out = titleQueries(vn);
    expect(out).toHaveLength(5);
    expect(out).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo']);
  });

  it('drops values shorter than 2 characters and whitespace-only values', () => {
    const vn = makeVn({
      title: 'a',
      alttitle: '   ',
      titles: [titleEntry('ab'), titleEntry('')],
    });
    expect(titleQueries(vn)).toEqual(['ab']);
  });

  it('keeps a value trimmed to exactly 2 characters', () => {
    const vn = makeVn({ title: '  ab  ' });
    expect(titleQueries(vn)).toEqual(['ab']);
  });

  it('de-duplicates case-insensitively across title, alttitle and titles', () => {
    const vn = makeVn({
      title: 'Heroine A',
      alttitle: 'heroine a',
      titles: [titleEntry('HEROINE A'), titleEntry('Studio X', 'studio x')],
    });
    expect(titleQueries(vn)).toEqual(['Heroine A', 'Studio X']);
  });

  it('includes both the title and latin reading from each titles entry', () => {
    const vn = makeVn({
      title: 'メイン',
      titles: [titleEntry('別名', 'betsumei')],
    });
    expect(titleQueries(vn)).toEqual(['メイン', '別名', 'betsumei']);
  });

  it('inserts caller-supplied extra terms before the per-language titles', () => {
    const vn = makeVn({
      title: 'alpha',
      titles: [titleEntry('charlie')],
    });
    expect(titleQueries(vn, ['bravo'])).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('ignores a null title and null alttitle', () => {
    const vn = makeVn({ title: null as unknown as string, alttitle: null });
    expect(titleQueries(vn)).toEqual([]);
  });
});

describe('titleQueriesForProvider', () => {
  it('returns the unmodified bounded set for a non-amazon provider', () => {
    const vn = makeVn({
      title: 'alpha',
      alttitle: 'ブラボー',
      titles: [titleEntry('チャーリー')],
    });
    expect(titleQueriesForProvider(vn, 'surugaya')).toEqual(['alpha', 'ブラボー', 'チャーリー']);
  });

  it('keeps only Japanese-script queries and slices to 3 for amazon_jp', () => {
    const vn = makeVn({
      title: 'romaji title',
      alttitle: 'ひらがな',
      titles: [
        titleEntry('カタカナ'),
        titleEntry('漢字名'),
        titleEntry('第四の和名'),
        titleEntry('another latin'),
      ],
    });
    expect(titleQueriesForProvider(vn, 'amazon_jp')).toEqual(['ひらがな', 'カタカナ', '漢字名']);
  });

  it('falls back to the bounded latin set for amazon_jp when no query has Japanese script', () => {
    const vn = makeVn({
      title: 'alpha',
      alttitle: 'bravo',
      titles: [titleEntry('charlie'), titleEntry('delta')],
    });
    expect(titleQueriesForProvider(vn, 'amazon_jp')).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('amazonSearchTerms', () => {
  it('returns the bare query plus the PCゲーム-qualified variant', () => {
    expect(amazonSearchTerms('alpha')).toEqual(['alpha', 'alpha PCゲーム']);
  });

  it('de-duplicates when both variants would be identical', () => {
    expect(amazonSearchTerms('beta PCゲーム')).toEqual(['beta PCゲーム', 'beta PCゲーム PCゲーム']);
    expect(new Set(amazonSearchTerms('beta PCゲーム')).size).toBe(2);
  });
});
