/**
 * Pins the novel / light-novel filter after operator feedback:
 *   "you treat 【小説】沙耶の唄 as normal result you are so bad for stock"
 *
 * `【小説】沙耶の唄` (and equivalents) is the Saya no Uta novel
 * adaptation — same title, different product. Without this filter
 * the title-string overlap pushed the row into the high-confidence
 * bucket because every other classifier signal was neutral.
 */
import { describe, expect, it } from 'vitest';
import { classifyOffer } from '../src/lib/stock-classify';

const target = {
  title: '沙耶の唄',
  altTitles: ['沙耶の唄'],
  aliases: [],
};

describe('classifyOffer — novel-title filter', () => {
  it('flags 【小説】<title> as content_kind=novel with the novel_title warning', () => {
    const c = classifyOffer('【小説】沙耶の唄', null, target, { provider: 'surugaya' });
    expect(c.contentKind).toBe('novel');
    expect(c.matchWarnings).toContain('novel_title');
    // Score sits below the 'low' threshold so the row is rejected outright.
    expect(c.matchConfidence).toBe('reject');
  });

  it('also catches 小説版 / ノベル版 / ノベライズ suffix forms', () => {
    for (const variant of ['沙耶の唄 小説版', '沙耶の唄 ノベル版', '沙耶の唄 ノベライズ']) {
      const c = classifyOffer(variant, null, target, { provider: 'surugaya' });
      expect(c.contentKind, `failed on: ${variant}`).toBe('novel');
    }
  });

  it('catches Japanese-bracket Light-Novel labels (【ライトノベル】 / 【ノベライズ】)', () => {
    for (const variant of ['【ライトノベル】沙耶の唄', '【ノベライズ】沙耶の唄']) {
      const c = classifyOffer(variant, null, target, { provider: 'surugaya' });
      expect(c.contentKind, `failed on: ${variant}`).toBe('novel');
    }
  });

  it('does NOT misfire on plain 沙耶の唄 (no novel marker)', () => {
    const c = classifyOffer('沙耶の唄 パッケージ版', null, target, { provider: 'surugaya' });
    expect(c.contentKind).not.toBe('novel');
    expect(c.matchWarnings).not.toContain('novel_title');
  });
});
