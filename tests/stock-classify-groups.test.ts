import { describe, expect, it } from 'vitest';
import {
  classifyOffer,
  classifyOfferGroup,
  classificationToFields,
  editionFromTitle,
  isEligibleGameStockOffer,
  platformFromTitle,
} from '@/lib/stock-classify';

/**
 * Targets the classification branches the existing stock-classify suites
 * leave uncovered: the display-group mapper, the storage serialiser, the
 * PC-software-provider content-kind fallback, the same-game-different-platform
 * relation, the direct-source trust boost arithmetic, and the explicit
 * confidence-bucket boundaries.
 */

describe('classifyOfferGroup display mapping', () => {
  it.each([
    ['related', 'bonus_only', null, 'high'],
    ['related', 'related_goods', null, 'high'],
    ['related', 'figure', null, 'high'],
    ['related', 'soundtrack', null, 'high'],
    ['related', 'artbook', null, 'high'],
    ['related', 'store_bonus_bundle', null, 'high'],
    ['related', 'game_package', 'related_goods', 'high'],
    ['rejected', 'game_package', 'exact_game', 'reject'],
    ['rejected', 'game_package', 'exact_game', 'low'],
    ['series', 'game_package', 'same_series_previous_game', 'high'],
    ['series', 'game_package', 'sequel_or_pack', 'high'],
    ['needs_review', 'game_package', 'exact_game', 'medium'],
    ['game', 'game_package', 'exact_game', 'high'],
    ['game', null, 'exact_game', 'high'],
    ['game', 'digital_download', 'exact_game', 'high'],
  ])('returns %s', (expected, contentKind, seriesRelation, confidence) => {
    expect(classifyOfferGroup(contentKind, seriesRelation, confidence)).toBe(expected);
  });

  it('treats undefined inputs as a game (legacy rows)', () => {
    expect(classifyOfferGroup(undefined, undefined, undefined)).toBe('game');
  });
});

describe('classifyOffer content-kind fallbacks', () => {
  it('treats a PC-software provider with no category as game_package (+30 path)', () => {
    const c = classifyOffer('架空ゲーム', null, { title: '架空ゲーム' }, { provider: 'sofmap' });
    expect(c.contentKind).toBe('game_package');
  });

  it('leaves a non-PC provider with no category as unknown', () => {
    const c = classifyOffer('mystery product', null, { title: 'mystery product' }, { provider: 'amazon_jp' });
    expect(c.contentKind).toBe('unknown');
  });

  it('classifies a soundtrack category (not title) as soundtrack', () => {
    const c = classifyOffer('プレーン', 'ゲームCD', { title: 'プレーン' });
    expect(c.contentKind).toBe('soundtrack');
    expect(c.matchWarnings).toContain('related_goods_category');
  });

  it('classifies an artbook category (not title) as artbook', () => {
    const c = classifyOffer('プレーン', '設定資料集', { title: 'プレーン' });
    expect(c.contentKind).toBe('artbook');
  });
});

describe('classifyOffer relation branches', () => {
  it('marks a contains-match game on a mismatched platform as same_game_different_platform', () => {
    const c = classifyOffer('架空ゲーム Switch', 'ニンテンドースイッチソフト', {
      title: '架空ゲーム',
      platforms: ['PC'],
    });
    expect(c.seriesRelation).toBe('same_game_different_platform');
  });

  it('keeps exact_game when the target declares no platforms', () => {
    const c = classifyOffer('架空ゲーム Switch', 'ニンテンドースイッチソフト', { title: '架空ゲーム' });
    expect(c.seriesRelation).toBe('exact_game');
  });

  it('classifies a contains-match download edition as same_game_different_edition', () => {
    const c = classifyOffer('架空ゲーム ダウンロード版', null, { title: '架空ゲーム', platforms: ['PC'] });
    expect(c.seriesRelation).toBe('same_game_different_edition');
  });

  it('falls back to unrelated when the base name is too short for series matching', () => {
    const c = classifyOffer('zzz', null, { title: 'X9' });
    expect(c.seriesRelation).toBe('unrelated');
  });
});

describe('classifyOffer direct-source trust boost', () => {
  it('adds exactly +30 over the equivalent search score for a contained exact game', () => {
    const base = { title: '架空ゲーム', platforms: ['PC'] };
    const search = classifyOffer('架空ゲーム', 'PCソフト', base, { source: 'search' });
    const direct = classifyOffer('架空ゲーム', 'PCソフト', base, { source: 'direct' });
    const manual = classifyOffer('架空ゲーム', 'PCソフト', base, { source: 'manual' });
    expect(direct.matchScore).toBe(search.matchScore + 30);
    expect(manual.matchScore).toBe(search.matchScore + 30);
  });

  it('does not boost related-goods even from a direct source', () => {
    const base = { title: '架空ゲーム' };
    const search = classifyOffer('架空ゲーム タペストリー', 'タペストリー', base, { source: 'search' });
    const direct = classifyOffer('架空ゲーム タペストリー', 'タペストリー', base, { source: 'direct' });
    expect(direct.matchScore).toBe(search.matchScore);
  });
});

describe('classifyOffer confidence boundaries', () => {
  it('reaches exact (>=100) for a direct platform-matched software hit', () => {
    const c = classifyOffer('架空ゲーム 限定版', 'PCソフト', { title: '架空ゲーム', platforms: ['PC'] }, { source: 'direct' });
    expect(c.matchConfidence).toBe('exact');
  });

  it('lands in high (70-99) for a search-source software hit with no platform signal', () => {
    // software +40, exact_game contains +50 = 90 (category ゲームソフト has no
    // platform token, title has none either, so no +10/+15 platform bonuses).
    const c = classifyOffer('架空ゲーム', 'ゲームソフト', { title: '架空ゲーム' }, { source: 'search' });
    expect(c.matchScore).toBe(90);
    expect(c.matchConfidence).toBe('high');
  });

  it('lands in low (10-39) for a platform-mismatched series sibling', () => {
    const c = classifyOffer('架空ゲーム2', 'ニンテンドースイッチソフト', { title: '架空ゲーム3', platforms: ['Switch'] });
    expect(['low', 'reject']).toContain(c.matchConfidence);
  });
});

describe('classificationToFields', () => {
  it('serialises warnings to JSON and forwards primitives unchanged', () => {
    const c = classifyOffer('架空ゲーム フィギュア', 'フィギュア', { title: '架空ゲーム' });
    const fields = classificationToFields(c);
    expect(JSON.parse(fields.match_warnings_json)).toEqual(c.matchWarnings);
    expect(fields.content_kind).toBe(c.contentKind);
    expect(fields.platform).toBe(c.platform);
    expect(fields.edition_kind).toBe(c.editionKind);
    expect(fields.series_relation).toBe(c.seriesRelation);
    expect(fields.match_confidence).toBe(c.matchConfidence);
    expect(fields.match_score).toBe(c.matchScore);
  });
});

describe('remaining title-detection branches', () => {
  it.each([
    ['架空ゲーム PlayStation 5', 'PS5'],
    ['架空ゲーム PSVita', 'PSVita'],
  ])('platformFromTitle(%s) = %s', (title, expected) => {
    expect(platformFromTitle(title)).toBe(expected);
  });

  it.each([
    ['架空ゲーム お買得版', 'budget'],
    ['架空ゲーム 豪華版', 'deluxe'],
    ['架空ゲーム 完全版', 'complete_pack'],
  ])('editionFromTitle(%s) = %s', (title, expected) => {
    expect(editionFromTitle(title)).toBe(expected);
  });

  it('classifies a doll/figure category (not a goods keyword) as figure', () => {
    const c = classifyOffer('プレーンタイトル', 'ドール', { title: 'プレーンタイトル' });
    expect(c.contentKind).toBe('figure');
    expect(c.matchWarnings).toContain('related_goods_category');
  });

  it('classifies a goods category with a non-goods title as related_goods', () => {
    const c = classifyOffer('プレーンタイトル', 'キーホルダー', { title: 'プレーンタイトル' });
    expect(c.contentKind).toBe('related_goods');
    expect(c.matchWarnings).toContain('related_goods_category');
  });

  it('detects the PC platform from a for-Windows title with no category', () => {
    const c = classifyOffer('架空ゲーム for Windows', null, { title: '架空ゲーム' });
    expect(c.platform).toBe('PC');
  });
});

describe('isEligibleGameStockOffer relation rejection', () => {
  it('rejects an in-stock high-confidence game with a non-allowed series relation', () => {
    expect(isEligibleGameStockOffer({
      availability: 'in_stock',
      content_kind: 'game_package',
      match_confidence: 'high',
      series_relation: 'sequel_or_pack',
    })).toBe(false);
  });
});
