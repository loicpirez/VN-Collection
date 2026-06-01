import { describe, expect, it } from 'vitest';
import {
  comparableAliceNetDate as comparableDate,
  alicenetMatchKind,
  displayAliceNetTitle,
  displayAliceNetProducer,
  parseAliceNetDevs,
  type AliceNetItem,
} from '@/components/alicenet-types';

describe('alicenet comparableDate (U-238 sorter)', () => {
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

describe('alicenetMatchKind (U-234 — split helpers)', () => {
  const base: Partial<AliceNetItem> = {
    code: '111-222222-333',
    title: 'sample',
    vn_id: null,
    vn_match_source: null,
    egs_id: null,
  };
  it('vndb when vn_id is set', () => {
    expect(alicenetMatchKind({ ...base, vn_id: 'v90017' } as AliceNetItem)).toBe('vndb');
  });
  it('egs when only egs_id is set', () => {
    expect(alicenetMatchKind({ ...base, egs_id: 9500001 } as AliceNetItem)).toBe('egs');
  });
  it('unresolved when vn_match_source = "none"', () => {
    expect(alicenetMatchKind({ ...base, vn_match_source: 'none' } as AliceNetItem)).toBe('unresolved');
  });
  it('new when nothing is set', () => {
    expect(alicenetMatchKind(base as AliceNetItem)).toBe('new');
  });
});

describe('displayAliceNetTitle / displayAliceNetProducer / parseAliceNetDevs', () => {
  it('prefers egs_title over title', () => {
    const i = { title: 'raw', egs_title: 'curated' } as AliceNetItem;
    expect(displayAliceNetTitle(i)).toBe('curated');
  });
  it('falls back to title when egs_title is empty', () => {
    const i = { title: 'raw', egs_title: null } as AliceNetItem;
    expect(displayAliceNetTitle(i)).toBe('raw');
  });
  it('producer prefers vn_developers JSON first entry', () => {
    const i = { vn_developers: JSON.stringify([{ id: 'p1', name: 'Studio X' }]), egs_brand: 'Brand Y' } as AliceNetItem;
    expect(displayAliceNetProducer(i)).toBe('Studio X');
  });
  it('producer falls back to egs_brand when developers JSON is empty', () => {
    const i = { vn_developers: '[]', egs_brand: 'Brand Y' } as AliceNetItem;
    expect(displayAliceNetProducer(i)).toBe('Brand Y');
  });
  it('parseAliceNetDevs handles malformed JSON without throwing', () => {
    expect(parseAliceNetDevs('not-json')).toEqual([]);
    expect(parseAliceNetDevs(null)).toEqual([]);
  });
});
