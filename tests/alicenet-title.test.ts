import { describe, expect, it } from 'vitest';
import {
  buildAliceNetTitleSearchQueries,
  normalizeTitle,
  normalizeTitleAggressive,
} from '@/lib/alicenet';

describe('AliceNet title cleanup', () => {
  it('keeps a short Japanese query for romanized subtitle titles', () => {
    expect(normalizeTitle('(中古品) ぎゃるふろ　－Ｇｉｒｌ’ｓＦｒｏｎｔｉｅｒ－'))
      .toBe("ぎゃるふろ -Girl'sFrontier-");
    expect(buildAliceNetTitleSearchQueries('(中古品) ぎゃるふろ　－Ｇｉｒｌ’ｓＦｒｏｎｔｉｅｒ－'))
      .toContain('ぎゃるふろ');
  });

  it('drops trailing maker/fandisc text without losing version tokens', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) くろふぁん４ＧＨｚ　ＣＬＯＣＫＵＰ　ＦＡＮＤＩＳＣ'))
      .toContain('くろふぁん4GHz');
  });

  it('strips reprint and media markers that VNDB does not index', () => {
    expect(normalizeTitleAggressive('(中古品) つまつま１．５　ここは新妻ぱらだいす！復刻'))
      .toBe('つまつま1.5 ここは新妻ぱらだいす!');
    expect(normalizeTitleAggressive('(中古品) へんし～ん！　ＤＶＤ－ＲＯＭ版'))
      .toBe('へんし~ん!');
  });

  it('does not split a single wave dash inside the real title', () => {
    const queries = buildAliceNetTitleSearchQueries('(中古品) すくぅ～るメイト２');
    expect(queries[0]).toBe('すくぅ~るメイト2');
    expect(queries).not.toContain('すくぅ');
  });

  it('normalizes mini fandisc volume spacing for retry searches', () => {
    const queries = buildAliceNetTitleSearchQueries('(中古品) ゆびさきコネクション　ミニＦＤ　Ｖｏｌ．１　通常版');
    expect(queries[0]).toBe('ゆびさきコネクション ミニFD Vol.1');
    expect(queries).toContain('ゆびさきコネクション');
    expect(queries).toContain('ゆびさきコネクションミニFDVol.1');
  });

  it('keeps hardware-looking title tokens intact while spacing DLC markers', () => {
    const customMaid = buildAliceNetTitleSearchQueries('(中古品) カスタムメイド３Ｄ２　ＣＰ　健康的でスポーティなボクっ娘');
    expect(customMaid).toContain('カスタムメイド3D2 CP 健康的でスポーティなボクっ娘');
    expect(customMaid).not.toContain('カスタムメイド3 D2 CP 健康的でスポーティなボクっ娘');

    const natural = buildAliceNetTitleSearchQueries('(中古品) ナチュラル０Ｐｌｕｓ　通常版');
    expect(natural).toContain('ナチュラル0 Plus');
  });

  it('tries collection-free variants for bundle and anthology shop titles', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) ヌキコレ３８　ギアーズオブドラグーン'))
      .toContain('ギアーズオブドラグーン');
    expect(buildAliceNetTitleSearchQueries('(中古品) ＭＰＣｖｏｌ．３きっと、澄み渡る…＋すきま桜と…'))
      .toContain('きっと、澄み渡る...+すきま桜と...');
  });

  it('normalizes compact roman title spacing without breaking sequel numbers', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) 蒼の彼方のフォーリズムＥＸ２　スタンダードエディション'))
      .toContain('蒼の彼方のフォーリズムEX2');
    expect(buildAliceNetTitleSearchQueries('(中古品) ２００５下半期ＬＩＬＩＴＨ　ＢＥＳＴ　ＳＥＬＥＣＴＩＯＮ'))
      .toContain('2005下半期LILITH BEST SELECTION');
  });

  it('tries common VNDB/EGS title dialects for stubborn AliceNet rows', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) イチャ２スタディ由乃　通常版'))
      .toContain('イチャ×2スタディ由乃');
    expect(buildAliceNetTitleSearchQueries('(中古品) ドキ２しすたぁパラダイス２　初回版'))
      .toContain('ドキドキしすたぁパラダイス2');
    expect(buildAliceNetTitleSearchQueries('(中古品) Ｄ．Ｃ．２　～ダ・カーポ２～　Ｆａｌｌ　ｉｎ　Ｌｏｖｅ　初回'))
      .toContain('D.C.II ~ダ・カーポII~ Fall in Love');
    expect(buildAliceNetTitleSearchQueries('(中古品) Ａ．Ｇ．２．Ｄ．Ｃ．　～あるぴじ学園２～　初回版'))
      .toContain('A.G.II.D.C. ~あるぴじ学園2~');
    expect(buildAliceNetTitleSearchQueries('(中古品) すりーえすＳＳＳ　初回版'))
      .toContain('SSS Three S');
    expect(buildAliceNetTitleSearchQueries('(中古品) ドＳお姉さんは好きですか？　廉価版'))
      .toContain('ドSなお姉さんは好きですか?');
    expect(buildAliceNetTitleSearchQueries('(中古品) ガンマディメンジョン～アルファナイトフォークＦＤ～'))
      .toContain('GAMMA DIMENSION~アルファナイトフォークFD~');
    expect(buildAliceNetTitleSearchQueries('(中古品) 戦国恋姫ブレイブ壱'))
      .toContain('戦国†恋姫BRAVE壱');
  });

  it('extracts subtitle and tail probes when the shop title has a typo or package prefix', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) 悪堕ちラビリンス　－囚われ魔王と奈落の狂人'))
      .toContain('悪堕ラビリンス -囚われ魔王と奈落の狂人');
    expect(buildAliceNetTitleSearchQueries('(中古品) ＷｈｉｔｅＡｎｇｅｌＦａｎＤｉｓｃ　天使のこばこ'))
      .toContain('天使のこばこ');
    expect(buildAliceNetTitleSearchQueries('(中古品) 神聖昴燐エストランジェ　オナホール同梱版'))
      .toContain('神聖昂燐エストランジェ');
  });

  it('covers storefront-specific title aliases and chapter spellings', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) 花鐘カナデグラム chapter2 続編'))
      .toContain('花鐘カナデ＊グラム Chapter:2 続編');
    expect(buildAliceNetTitleSearchQueries('(中古品) 花鐘カナデグラム 続編'))
      .not.toContain('花鐘カナデ＊グラム Chapter: 続編');
    expect(buildAliceNetTitleSearchQueries('(中古品) メイキングラヴァーズ'))
      .toContain('Making * Lovers');
    expect(buildAliceNetTitleSearchQueries("(中古品) Amenity'sLifeFD"))
      .toContain("Amenity's Life MiniFanDisc");
    expect(buildAliceNetTitleSearchQueries('(中古品) ＰｉａキャロットＧ．Ｐ．'))
      .toContain('Pia Carrot G.P.');
    expect(buildAliceNetTitleSearchQueries('(中古品) ＬＯＷな妹に迫られています'))
      .toContain('LOWな妹');
    expect(buildAliceNetTitleSearchQueries('(中古品) 黒山羊　くろやぎ'))
      .toContain('黒山羊');
    expect(buildAliceNetTitleSearchQueries('(中古品) 催淫キーワード'))
      .toContain('Saiin Haramase Keyword');
  });

  it('splits numbered packs and ignores unusably short pack fragments', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) シンセティック１＋２パック'))
      .toEqual(expect.arrayContaining(['シンセティック1', 'シンセティック2']));
    const short = buildAliceNetTitleSearchQueries('ab+cd');
    expect(short).not.toContain('ab');
    expect(short).not.toContain('cd');
  });

  it('returns no search probes when cleanup removes the whole title', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品)')).toEqual([]);
  });

  it('retains an exact long storefront title without expanding it into more probes', () => {
    const queries = buildAliceNetTitleSearchQueries(`(中古品) ${'長'.repeat(90)}`);
    expect(queries).toEqual(['長'.repeat(90)]);
  });

  it('keeps the empty-tail White Angel spelling and mixed leading probes stable', () => {
    expect(buildAliceNetTitleSearchQueries('(中古品) WhiteAngelFanDisc'))
      .toContain('White Angel Fan Disc');
    expect(buildAliceNetTitleSearchQueries('ab cdef ghij'))
      .toContain('ab cdef');
  });
});
