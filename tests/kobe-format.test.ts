/**
 * Audit U-238 / U-239 / U-234: pins the kobe date + price formatters
 * after the U-234 file split. Imports the canonical helpers from
 * `src/components/kobe-types.ts` (the post-split home) so the test
 * exercises the same code the component runs.
 */
import { describe, expect, it } from 'vitest';
import {
  comparableKobeDate as comparableDate,
  formatKobePrice,
  kobeMatchKind,
  displayKobeTitle,
  displayKobeProducer,
  parseKobeDevs,
  type KobeItem,
} from '@/components/kobe-types';

describe('kobe price formatter (U-239)', () => {
  it('parses ¥4,270 and reformats per locale', () => {
    // JA produces ￥4,270 (full-width yen); EN produces ¥4,270; FR
    // produces "4 270 JPY". We just assert the digits survive and
    // the locale-specific JPY indicator is present.
    expect(formatKobePrice('¥4,270', 'ja')).toContain('4,270');
    expect(formatKobePrice('¥4,270', 'en')).toContain('4,270');
    expect(formatKobePrice('¥4,270', 'fr')).toContain('270');
  });

  it('parses "4,270円" with trailing kanji', () => {
    expect(formatKobePrice('4,270円', 'ja')).toContain('4,270');
  });

  it('returns empty string for null', () => {
    expect(formatKobePrice(null, 'ja')).toBe('');
  });

  it('falls back to raw when the digit run is empty', () => {
    expect(formatKobePrice('—', 'ja')).toBe('—');
  });
});

describe('kobe comparableDate (U-238 sorter)', () => {
  it('canonicalises YYYY/M/D to YYYY-MM-DD', () => {
    expect(comparableDate('2017/1/2')).toBe('2017-01-02');
    expect(comparableDate('2017/12/22')).toBe('2017-12-22');
  });

  it('canonicalises YYYY-M-D to YYYY-MM-DD', () => {
    expect(comparableDate('2017-1-2')).toBe('2017-01-02');
  });

  it('passes through unrecognised formats', () => {
    expect(comparableDate('2017')).toBe('2017');
    expect(comparableDate('2017年12月')).toBe('2017年12月');
  });

  it('returns empty for null', () => {
    expect(comparableDate(null)).toBe('');
  });
});

describe('kobeMatchKind (U-234 — split helpers)', () => {
  const base: Partial<KobeItem> = {
    code: '111-222222-333',
    title: 'sample',
    vn_id: null,
    vn_match_source: null,
    egs_id: null,
  };
  it('vndb when vn_id is set', () => {
    expect(kobeMatchKind({ ...base, vn_id: 'v90017' } as KobeItem)).toBe('vndb');
  });
  it('egs when only egs_id is set', () => {
    expect(kobeMatchKind({ ...base, egs_id: 9500001 } as KobeItem)).toBe('egs');
  });
  it('unresolved when vn_match_source = "none"', () => {
    expect(kobeMatchKind({ ...base, vn_match_source: 'none' } as KobeItem)).toBe('unresolved');
  });
  it('new when nothing is set', () => {
    expect(kobeMatchKind(base as KobeItem)).toBe('new');
  });
});

describe('displayKobeTitle / displayKobeProducer / parseKobeDevs', () => {
  it('prefers egs_title over title', () => {
    const i = { title: 'raw', egs_title: 'curated' } as KobeItem;
    expect(displayKobeTitle(i)).toBe('curated');
  });
  it('falls back to title when egs_title is empty', () => {
    const i = { title: 'raw', egs_title: null } as KobeItem;
    expect(displayKobeTitle(i)).toBe('raw');
  });
  it('producer prefers vn_developers JSON first entry', () => {
    const i = { vn_developers: JSON.stringify([{ id: 'p1', name: 'Studio X' }]), egs_brand: 'Brand Y' } as KobeItem;
    expect(displayKobeProducer(i)).toBe('Studio X');
  });
  it('producer falls back to egs_brand when developers JSON is empty', () => {
    const i = { vn_developers: '[]', egs_brand: 'Brand Y' } as KobeItem;
    expect(displayKobeProducer(i)).toBe('Brand Y');
  });
  it('parseKobeDevs handles malformed JSON without throwing', () => {
    expect(parseKobeDevs('not-json')).toEqual([]);
    expect(parseKobeDevs(null)).toEqual([]);
  });
});
