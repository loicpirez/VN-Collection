import { describe, expect, it } from 'vitest';
import { classifyOfferGroup } from '@/lib/stock-classify';

describe('classifyOfferGroup', () => {
  it('bonus_only → related', () => {
    expect(classifyOfferGroup('bonus_only', 'exact_game', 'exact')).toBe('related');
  });

  it('related_goods → related', () => {
    expect(classifyOfferGroup('related_goods', 'exact_game', 'high')).toBe('related');
  });

  it('figure → related', () => {
    expect(classifyOfferGroup('figure', 'related_goods', 'medium')).toBe('related');
  });

  it('soundtrack → related', () => {
    expect(classifyOfferGroup('soundtrack', 'related_goods', 'high')).toBe('related');
  });

  it('artbook → related', () => {
    expect(classifyOfferGroup('artbook', 'related_goods', 'high')).toBe('related');
  });

  it('store_bonus_bundle → related', () => {
    expect(classifyOfferGroup('store_bonus_bundle', 'exact_game', 'exact')).toBe('related');
  });

  it('series_relation related_goods → related regardless of contentKind', () => {
    expect(classifyOfferGroup('game_package', 'related_goods', 'exact')).toBe('related');
  });

  it('matchConfidence reject → rejected', () => {
    expect(classifyOfferGroup('game_package', 'exact_game', 'reject')).toBe('rejected');
  });

  it('matchConfidence low → rejected (not game)', () => {
    expect(classifyOfferGroup('game_package', 'exact_game', 'low')).toBe('rejected');
  });

  it('same_series_previous_game → series', () => {
    expect(classifyOfferGroup('game_package', 'same_series_previous_game', 'medium')).toBe('series');
  });

  it('sequel_or_pack → series', () => {
    expect(classifyOfferGroup('game_package', 'sequel_or_pack', 'high')).toBe('series');
  });

  it('game_package + exact → game', () => {
    expect(classifyOfferGroup('game_package', 'exact_game', 'exact')).toBe('game');
  });

  it('game_package + high → game', () => {
    expect(classifyOfferGroup('game_package', 'exact_game', 'high')).toBe('game');
  });

  it('game_package + medium → game', () => {
    expect(classifyOfferGroup('game_package', 'exact_game', 'medium')).toBe('game');
  });

  it('null contentKind (legacy pre-classification) → game', () => {
    expect(classifyOfferGroup(null, 'exact_game', 'exact')).toBe('game');
  });

  it('undefined contentKind → game', () => {
    expect(classifyOfferGroup(undefined, 'exact_game', 'high')).toBe('game');
  });

  it('digital_download + high → game', () => {
    expect(classifyOfferGroup('digital_download', 'exact_game', 'high')).toBe('game');
  });
});
