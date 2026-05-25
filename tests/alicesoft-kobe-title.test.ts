import { describe, expect, it } from 'vitest';
import {
  buildKobeTitleSearchQueries,
  normalizeTitle,
  normalizeTitleAggressive,
} from '@/lib/alicesoft-kobe';

describe('Alice Kobe title cleanup', () => {
  it('keeps a short Japanese query for romanized subtitle titles', () => {
    expect(normalizeTitle('(中古品) ぎゃるふろ　－Ｇｉｒｌ’ｓＦｒｏｎｔｉｅｒ－'))
      .toBe("ぎゃるふろ -Girl'sFrontier-");
    expect(buildKobeTitleSearchQueries('(中古品) ぎゃるふろ　－Ｇｉｒｌ’ｓＦｒｏｎｔｉｅｒ－'))
      .toContain('ぎゃるふろ');
  });

  it('drops trailing maker/fandisc text without losing version tokens', () => {
    expect(buildKobeTitleSearchQueries('(中古品) くろふぁん４ＧＨｚ　ＣＬＯＣＫＵＰ　ＦＡＮＤＩＳＣ'))
      .toContain('くろふぁん4GHz');
  });

  it('strips reprint and media markers that VNDB does not index', () => {
    expect(normalizeTitleAggressive('(中古品) つまつま１．５　ここは新妻ぱらだいす！復刻'))
      .toBe('つまつま1.5 ここは新妻ぱらだいす!');
    expect(normalizeTitleAggressive('(中古品) へんし～ん！　ＤＶＤ－ＲＯＭ版'))
      .toBe('へんし~ん!');
  });

  it('does not split a single wave dash inside the real title', () => {
    const queries = buildKobeTitleSearchQueries('(中古品) すくぅ～るメイト２');
    expect(queries[0]).toBe('すくぅ~るメイト2');
    expect(queries).not.toContain('すくぅ');
  });

  it('normalizes mini fandisc volume spacing for retry searches', () => {
    const queries = buildKobeTitleSearchQueries('(中古品) ゆびさきコネクション　ミニＦＤ　Ｖｏｌ．１　通常版');
    expect(queries[0]).toBe('ゆびさきコネクション ミニFD Vol.1');
    expect(queries).toContain('ゆびさきコネクション');
    expect(queries).toContain('ゆびさきコネクションミニFDVol.1');
  });
});
