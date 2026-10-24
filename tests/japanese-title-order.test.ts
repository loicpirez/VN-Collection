import { describe, expect, it } from 'vitest';
import { compareJapaneseTitles, japaneseTitleReading, type JapaneseTitle } from '@/lib/japanese-title-order';
import { paginateJapaneseTitleRows } from '@/lib/db/japanese-title-order';

const title = (name: string, id = 'v95001'): JapaneseTitle => ({ id, title: name });

describe('Japanese title ordering', () => {
  it('uses the standard vowel and consonant rows independent of input order', () => {
    const ordered = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.split('');
    expect([...ordered].reverse().map((name, index) => title(name, `v${95000 + index}`))
      .sort(compareJapaneseTitles).map((item) => item.title)).toEqual(ordered);
  });

  it('uses EGS furigana before title script or VNDB romanization', () => {
    expect(japaneseTitleReading({ title: '空の見本', alttitle: 'ソラ', title_reading: 'アオゾラ', titles: [{ lang: 'ja', title: '空の見本', latin: 'Sora no Mihon' }] })).toBe('あおぞら');
    expect(japaneseTitleReading({ title: 'Translated sample', titles: [{ lang: 'ja', title: '青空の見本', latin: 'Aozora no Mihon' }] })).toBe('あおぞらのみほん');
    expect(japaneseTitleReading({ title: 'Alternate sample', alttitle: 'カナミホン' })).toBe('かなみほん');
    expect(japaneseTitleReading({ title: 'Translated sample', titles: [{ lang: 'ja', title: 'かなみほん', latin: null }] })).toBe('かなみほん');
  });

  it('normalizes width, script, punctuation and prolonged vowels', () => {
    for (const name of ['ｶﾞｰﾃﾞﾝ', 'ガーデン', 'がーでん', 'があでん', '「があでん」']) {
      expect(japaneseTitleReading(title(name))).toBe('があでん');
    }
    expect(japaneseTitleReading({ title: 'Reading sample', titles: [{ lang: 'ja', title: '見本', latin: 'Ā Ī Ū Ē Ō â î û ê ô' }] })).toBe('ああいいううええおうああいいううええおう');
  });

  it('groups dakuten and small kana with their base kana before comparing secondary differences', () => {
    const names = ['きい', 'があ', 'かい', 'かあ'];
    expect(names.map((name) => title(name)).sort(compareJapaneseTitles).map((item) => item.title))
      .toEqual(['かあ', 'があ', 'かい', 'きい']);
    expect(compareJapaneseTitles(title('ゃあ'), title('やい'))).toBeLessThan(0);
    expect(compareJapaneseTitles(title('はあ'), title('ぱい'))).toBeLessThan(0);
  });

  it('sorts numeric suffixes naturally and resolves equal readings deterministically', () => {
    expect(compareJapaneseTitles(title('かな2'), title('かな10'))).toBeLessThan(0);
    expect(compareJapaneseTitles({ ...title('A'), title_reading: 'かな' }, { ...title('B'), title_reading: 'かな' })).toBeLessThan(0);
    expect(compareJapaneseTitles(title('かな', 'v95001'), title('かな', 'v95002'))).toBeLessThan(0);
    expect(compareJapaneseTitles(title('かな'), title('かな'))).toBe(0);
    expect(compareJapaneseTitles(title('Alpha', 'v95001'), title('Alpha', 'v95002'))).toBeLessThan(0);
  });

  it('never guesses a kanji reading or transliterates an English display title', () => {
    expect(japaneseTitleReading(title('空の見本'))).toBeNull();
    expect(japaneseTitleReading(title('English sample'))).toBeNull();
    expect(japaneseTitleReading({ title: '見本', title_reading: ' ', titles: [{ lang: 'en', title: 'Sample', latin: 'Aozora' }] })).toBeNull();
    expect(japaneseTitleReading({ title: '見本', titles: [{ lang: 'ja', title: '見本', latin: 'xyz' }] })).toBeNull();
    expect(japaneseTitleReading({ title: '見本', titles: [{ lang: 'ja', title: '見本', latin: null }] })).toBeNull();
    for (const order of ['asc', 'desc'] as const) {
      expect(compareJapaneseTitles(title('かな'), title('見本'), order)).toBeLessThan(0);
      expect(compareJapaneseTitles(title('見本'), title('かな'), order)).toBeGreaterThan(0);
    }
    expect(compareJapaneseTitles(title('あ'), title('い'), 'desc')).toBeGreaterThan(0);
    expect(compareJapaneseTitles(title('Alpha'), title('Beta'))).toBeLessThan(0);
  });

  it('orders every matched database row before slicing and tolerates old title metadata', () => {
    const rows = [
      { ...title('Zulu', 'v95003'), alttitle: null, title_sort_titles: 'invalid', title_furigana: 'う' },
      { ...title('Alpha', 'v95001'), alttitle: null, title_sort_titles: JSON.stringify([{ lang: 'ja', title: '見本', latin: 'Ai', official: true, main: true }]) },
      { ...title('Beta', 'v95002'), alttitle: null, title_sort_titles: '[]', title_furigana: 'い' },
    ];
    expect(paginateJapaneseTitleRows(rows, 'asc', 1, 1).map((row) => row.id)).toEqual(['v95002']);
    expect(paginateJapaneseTitleRows(rows, 'desc', 1, 0).map((row) => row.id)).toEqual(['v95003']);
    expect(paginateJapaneseTitleRows([{ ...title('あ'), alttitle: null }], 'asc', 1, 0)).toHaveLength(1);
    expect(paginateJapaneseTitleRows([{ ...title('あ'), alttitle: null, title_sort_titles: '[{}]' }], 'asc', 1, 0)).toHaveLength(1);
    expect(rows[0].id).toBe('v95003');
  });
});
