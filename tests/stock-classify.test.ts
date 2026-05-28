import { describe, expect, it } from 'vitest';
import {
  classifyOffer,
  editionFromTitle,
  isEligibleGameStockOffer,
  normalizeTitle,
  platformFromCategory,
  platformFromTitle,
  seriesNumberMismatch,
} from '@/lib/stock-classify';

const TARGET_SAMPLE_3 = { title: 'サンプル3', aliases: ['サンプル3Cute', 'Sample 3'] };

describe('platformFromCategory', () => {
  it('Switch', () => expect(platformFromCategory('ニンテンドースイッチソフト')).toBe('Switch'));
  it('PS4', () => expect(platformFromCategory('PS4ソフト')).toBe('PS4'));
  it('PS5', () => expect(platformFromCategory('PS5ソフト')).toBe('PS5'));
  it('PSVita', () => expect(platformFromCategory('PSVITAソフト')).toBe('PSVita'));
  it('PC', () => expect(platformFromCategory('PCソフト')).toBe('PC'));
  it('unknown category', () => expect(platformFromCategory('タペストリー')).toBe('unknown'));
  it('empty string', () => expect(platformFromCategory('')).toBe('unknown'));
});

describe('platformFromTitle', () => {
  it('detects Switch in title', () => expect(platformFromTitle('PS4/Switchソフト サンプル3Cute')).toBe('Switch'));
  it('detects PS4 in title', () => expect(platformFromTitle('PS4版 タイトル')).toBe('PS4'));
  it('returns unknown for unrelated title', () => expect(platformFromTitle('アクリルスタンド')).toBe('unknown'));
});

describe('editionFromTitle', () => {
  it('通常版 → standard', () => expect(editionFromTitle('サンプル3Cute [通常版]')).toBe('standard'));
  it('初回限定版 → first_press', () => expect(editionFromTitle('タイトル [初回限定版]')).toBe('first_press'));
  it('完全生産限定版 → limited', () => expect(editionFromTitle('タイトル [完全生産限定版]')).toBe('limited'));
  it('限定版 → limited', () => expect(editionFromTitle('タイトル 限定版')).toBe('limited'));
  it('ランクB → used_rank_b', () => expect(editionFromTitle('タイトル ランクB')).toBe('used_rank_b'));
  it('no edition → unknown', () => expect(editionFromTitle('タイトル')).toBe('unknown'));
});

describe('normalizeTitle', () => {
  it('lowercases and removes brackets', () => {
    expect(normalizeTitle('サンプル3Cute [通常版]')).toBe('サンプル3cute 通常版');
  });
  it('full-width to half-width', () => {
    expect(normalizeTitle('Ｔｅ　Ｓｔ')).toBe('te st');
  });
  it('normalizes full-width tilde ～ to ~', () => {
    expect(normalizeTitle('てすと～ABC☆SAMPLE～')).toBe('てすと~abcsample~');
  });
  it('normalizes wave dash 〜 (U+301C) same as full-width tilde', () => {
    expect(normalizeTitle('へんし〜ん')).toBe('へんし~ん');
  });
  it('strips decorative symbols ☆★♪', () => {
    expect(normalizeTitle('ABC☆SAMPLE')).toBe('abcsample');
    expect(normalizeTitle('ABC★SAMPLE')).toBe('abcsample');
    expect(normalizeTitle('ゲーム♪スター')).toBe('ゲームスター');
  });
  it('tilde variants (full-width ～ and wave dash 〜) normalize identically', () => {
    const a = normalizeTitle('てすと～ABC☆SAMPLE～');
    const b = normalizeTitle('てすと〜ABC★SAMPLE〜');
    expect(a).toBe(b);
  });
});

describe('seriesNumberMismatch', () => {
  it('サンプル2 vs サンプル3 → mismatch', () =>
    expect(seriesNumberMismatch('サンプル2 [完全生産限定版]', 'サンプル3')).toBe(true));

  it('サンプル3Cute vs サンプル3 → no mismatch', () =>
    expect(seriesNumberMismatch('サンプル3Cute [通常版]', 'サンプル3')).toBe(false));

  it('サンプル (no number) vs サンプル3 → no mismatch from this fn', () =>
    expect(seriesNumberMismatch('サンプル [通常版]', 'サンプル3')).toBe(false));

  it('target has no number → no mismatch', () =>
    expect(seriesNumberMismatch('タイトルB', 'タイトル')).toBe(false));
});

describe('classifyOffer — サンプル3Cute [通常版] + Switch', () => {
  const cl = classifyOffer('サンプル3Cute [通常版]', 'ニンテンドースイッチソフト', TARGET_SAMPLE_3);

  it('contentKind = game_package', () => expect(cl.contentKind).toBe('game_package'));
  it('platform = Switch', () => expect(cl.platform).toBe('Switch'));
  it('editionKind = standard', () => expect(cl.editionKind).toBe('standard'));
  it('seriesRelation = exact_game', () => expect(cl.seriesRelation).toBe('exact_game'));
  it('matchConfidence = exact or high (score >= 70)', () =>
    expect(['exact', 'high']).toContain(cl.matchConfidence));
  it('no match warnings about bonus-only', () =>
    expect(cl.matchWarnings).not.toContain('bonus_only_item'));
  it('matchScore >= 70', () => expect(cl.matchScore).toBeGreaterThanOrEqual(70));
});

describe('classifyOffer — [単品] アクリルスタンド inside bonus bundle', () => {
  const cl = classifyOffer(
    '[単品] サンプル花子 アクリルスタンド 「PS4/Switchソフト サンプル3Cute WonderGOO限定セット」 同梱特典',
    'アクリルスタンド・アクリルパネル',
    TARGET_SAMPLE_3,
  );

  it('contentKind = bonus_only', () => expect(cl.contentKind).toBe('bonus_only'));
  it('matchConfidence = reject (not a game package)', () => expect(cl.matchConfidence).toBe('reject'));
  it('matchWarnings contains bonus-only item', () =>
    expect(cl.matchWarnings).toContain('bonus_only_item'));
  it('seriesRelation = related_goods', () => expect(cl.seriesRelation).toBe('related_goods'));
  it('matchScore < 10', () => expect(cl.matchScore).toBeLessThan(10));
});

describe('classifyOffer — タペストリー category', () => {
  const cl = classifyOffer('サンプル3 タペストリー', 'タペストリー', TARGET_SAMPLE_3);

  it('contentKind = related_goods', () => expect(cl.contentKind).toBe('related_goods'));
  it('matchConfidence = reject', () => expect(cl.matchConfidence).toBe('reject'));
  it('matchWarnings contains related goods', () =>
    expect(cl.matchWarnings.join(' ')).toMatch(/related_goods/i));
  it('seriesRelation = related_goods', () => expect(cl.seriesRelation).toBe('related_goods'));
});

describe('classifyOffer — サンプル2 when target is サンプル3', () => {
  const cl = classifyOffer('サンプル2 [完全生産限定版]', 'ニンテンドースイッチソフト', TARGET_SAMPLE_3);

  it('seriesRelation = same_series_previous_game', () =>
    expect(cl.seriesRelation).toBe('same_series_previous_game'));
  it('matchConfidence = low (score 10-39) or reject', () =>
    expect(['low', 'reject']).toContain(cl.matchConfidence));
  it('matchWarnings mentions same series but different game', () =>
    expect(cl.matchWarnings).toContain('same_series_different_game'));
});

describe('classifyOffer — サンプル (unnumbered) when target is サンプル3', () => {
  const cl = classifyOffer('サンプル [通常版]', 'ニンテンドースイッチソフト', TARGET_SAMPLE_3);

  it('seriesRelation = same_series_previous_game (base match without number)', () =>
    expect(cl.seriesRelation).toBe('same_series_previous_game'));
  it('matchConfidence not high', () => expect(['low', 'reject', 'medium']).toContain(cl.matchConfidence));
});

describe('classifyOffer — figure category', () => {
  const cl = classifyOffer('サンプル3 フィギュア', 'フィギュア', TARGET_SAMPLE_3);
  it('contentKind = figure', () => expect(cl.contentKind).toBe('figure'));
  it('matchConfidence = reject', () => expect(cl.matchConfidence).toBe('reject'));
});

describe('classifyOffer — unrelated title', () => {
  const cl = classifyOffer('全く別のゲーム [通常版]', 'ニンテンドースイッチソフト', TARGET_SAMPLE_3);
  it('seriesRelation = unrelated', () => expect(cl.seriesRelation).toBe('unrelated'));
  it('matchConfidence = low or reject (game+40 platform+10 edition+10 unrelated-40 = 20)', () =>
    expect(['low', 'reject']).toContain(cl.matchConfidence));
});

describe('classifyOffer — alias match', () => {
  const cl = classifyOffer('サンプル3Cute [限定版]', 'ニンテンドースイッチソフト', TARGET_SAMPLE_3);
  it('alias サンプル3Cute triggers exact_game', () => expect(cl.seriesRelation).toBe('exact_game'));
  it('matchConfidence = exact or high', () => expect(['exact', 'high']).toContain(cl.matchConfidence));
});

describe('classifyOffer — noisy media and goods titles', () => {
  it('rejects MP3 download as related media, not a game package', () => {
    const cl = classifyOffer('架空ゲーム 主題歌 MP3 ダウンロード', null, { title: '架空ゲーム' });
    expect(cl.contentKind).toBe('soundtrack');
    expect(cl.seriesRelation).toBe('related_goods');
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: cl.contentKind,
      series_relation: cl.seriesRelation,
      match_confidence: cl.matchConfidence,
    })).toBe(false);
  });

  it('rejects CD album wording as soundtrack', () => {
    const cl = classifyOffer('架空ゲーム ミニソングアルバム CD', null, { title: '架空ゲーム' });
    expect(cl.contentKind).toBe('soundtrack');
    expect(cl.matchWarnings.join(' ')).toMatch(/music|media/i);
  });

  it('rejects figure wording as related goods', () => {
    const cl = classifyOffer('架空ゲーム ヒロイン フィギュア', null, { title: '架空ゲーム' });
    expect(cl.contentKind).toBe('figure');
    expect(cl.seriesRelation).toBe('related_goods');
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: cl.contentKind,
      series_relation: cl.seriesRelation,
      match_confidence: cl.matchConfidence,
    })).toBe(false);
  });
});

describe('isEligibleGameStockOffer', () => {
  it('accepts exact direct game packages and rejects weak, related, and no-match offers', () => {
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: 'game_package',
      series_relation: 'exact_game',
      match_confidence: 'high',
    })).toBe(true);
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: 'game_package',
      series_relation: 'exact_game',
      match_confidence: 'low',
    })).toBe(false);
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: 'soundtrack',
      series_relation: 'related_goods',
      match_confidence: 'high',
    })).toBe(false);
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: 'game_package',
      series_relation: 'unrelated',
      match_confidence: 'reject',
    })).toBe(false);
  });
});
