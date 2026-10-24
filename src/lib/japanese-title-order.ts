import { toHiragana } from 'wanakana';

/** Title metadata used for reading-based ordering without guessing kanji readings. */
export interface JapaneseTitle {
  id: string;
  title: string;
  alttitle?: string | null;
  titles?: readonly { lang: string; title: string; latin: string | null }[];
  title_reading?: string | null;
}

const collator = new Intl.Collator('ja', { sensitivity: 'variant', numeric: true });
const smallKana = 'ぁぃぅぇぉっゃゅょゎゕゖ';
const largeKana = 'あいうえおつやゆよわかけ';

function normalizeKana(value: string): string {
  return toHiragana(value.normalize('NFKC').replace(/[ぁ-ゖ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) + 0x60)), { passRomaji: true })
    .replace(/[\p{P}\p{Z}\p{S}]/gu, '')
    .toLowerCase();
}

/** Resolve stored furigana, kana titles, or the Japanese title's explicit romanization. */
export function japaneseTitleReading(item: Omit<JapaneseTitle, 'id'>): string | null {
  if (item.title_reading?.trim()) return normalizeKana(item.title_reading);
  const japanese = item.titles?.find((title) => title.lang === 'ja');
  for (const title of [japanese?.title, item.alttitle, item.title]) {
    if (title && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title) && !/\p{Script=Han}/u.test(title)) {
      return normalizeKana(title);
    }
  }
  if (japanese?.latin?.trim()) {
    const romanized = japanese.latin.toLowerCase()
      .replace(/[āâ]/g, 'aa').replace(/[īî]/g, 'ii').replace(/[ūû]/g, 'uu')
      .replace(/[ēê]/g, 'ee').replace(/[ōô]/g, 'ou');
    const kana = toHiragana(romanized);
    if (!/[a-z]/i.test(kana)) return normalizeKana(kana);
  }
  return null;
}

function key(item: JapaneseTitle): { reading: string | null; primary: string } {
  const reading = japaneseTitleReading(item);
  return {
    reading,
    primary: (reading ?? item.title).normalize('NFD')
      .replace(/[\u3099\u309a]/g, '')
      .replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, (kana) => largeKana[smallKana.indexOf(kana)]),
  };
}

/** Compare Japanese readings; unavailable readings stay last in either direction. */
export function compareJapaneseTitles(a: JapaneseTitle, b: JapaneseTitle, order: 'asc' | 'desc' = 'asc'): number {
  const left = key(a);
  const right = key(b);
  if (left.reading === null && right.reading !== null) return 1;
  if (left.reading !== null && right.reading === null) return -1;
  const direction = order === 'asc' ? 1 : -1;
  return (collator.compare(left.primary, right.primary)
    || collator.compare(left.reading ?? a.title, right.reading ?? b.title)
    || collator.compare(a.title, b.title)) * direction
    || a.id.localeCompare(b.id, 'en');
}
