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

  it('keeps hardware-looking title tokens intact while spacing DLC markers', () => {
    const customMaid = buildKobeTitleSearchQueries('(中古品) カスタムメイド３Ｄ２　ＣＰ　健康的でスポーティなボクっ娘');
    expect(customMaid).toContain('カスタムメイド3D2 CP 健康的でスポーティなボクっ娘');
    expect(customMaid).not.toContain('カスタムメイド3 D2 CP 健康的でスポーティなボクっ娘');

    const natural = buildKobeTitleSearchQueries('(中古品) ナチュラル０Ｐｌｕｓ　通常版');
    expect(natural).toContain('ナチュラル0 Plus');
  });

  it('tries collection-free variants for bundle and anthology shop titles', () => {
    expect(buildKobeTitleSearchQueries('(中古品) ヌキコレ３８　ギアーズオブドラグーン'))
      .toContain('ギアーズオブドラグーン');
    expect(buildKobeTitleSearchQueries('(中古品) ＭＰＣｖｏｌ．３きっと、澄み渡る…＋すきま桜と…'))
      .toContain('きっと、澄み渡る...+すきま桜と...');
  });

  it('normalizes compact roman title spacing without breaking sequel numbers', () => {
    expect(buildKobeTitleSearchQueries('(中古品) 蒼の彼方のフォーリズムＥＸ２　スタンダードエディション'))
      .toContain('蒼の彼方のフォーリズムEX2');
    expect(buildKobeTitleSearchQueries('(中古品) ２００５下半期ＬＩＬＩＴＨ　ＢＥＳＴ　ＳＥＬＥＣＴＩＯＮ'))
      .toContain('2005下半期LILITH BEST SELECTION');
  });

  it('tries common VNDB/EGS title dialects for stubborn Kobe rows', () => {
    expect(buildKobeTitleSearchQueries('(中古品) イチャ２スタディ由乃　通常版'))
      .toContain('イチャ×2スタディ由乃');
    expect(buildKobeTitleSearchQueries('(中古品) ドキ２しすたぁパラダイス２　初回版'))
      .toContain('ドキドキしすたぁパラダイス2');
    expect(buildKobeTitleSearchQueries('(中古品) Ｄ．Ｃ．２　～ダ・カーポ２～　Ｆａｌｌ　ｉｎ　Ｌｏｖｅ　初回'))
      .toContain('D.C.II ~ダ・カーポII~ Fall in Love');
    expect(buildKobeTitleSearchQueries('(中古品) Ａ．Ｇ．２．Ｄ．Ｃ．　～あるぴじ学園２～　初回版'))
      .toContain('A.G.II.D.C. ~あるぴじ学園2~');
  });

  it('extracts subtitle and tail probes when the shop title has a typo or package prefix', () => {
    expect(buildKobeTitleSearchQueries('(中古品) 悪堕ちラビリンス　－囚われ魔王と奈落の狂人'))
      .toContain('悪堕ラビリンス -囚われ魔王と奈落の狂人');
    expect(buildKobeTitleSearchQueries('(中古品) ＷｈｉｔｅＡｎｇｅｌＦａｎＤｉｓｃ　天使のこばこ'))
      .toContain('天使のこばこ');
    expect(buildKobeTitleSearchQueries('(中古品) 神聖昴燐エストランジェ　オナホール同梱版'))
      .toContain('神聖昂燐エストランジェ');
  });
});
