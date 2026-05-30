import { describe, expect, it } from 'vitest';
import {
  comparableKobeDate as comparableDate,
  kobeMatchKind,
  displayKobeTitle,
  displayKobeProducer,
  parseKobeDevs,
  type KobeItem,
} from '@/components/kobe-types';

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
