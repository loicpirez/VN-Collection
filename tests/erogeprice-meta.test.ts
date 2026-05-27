/**
 * Real-fixture tests for the Eroge Price metadata + search parsers.
 *
 * The fixtures were captured with `curl` on 2026-05-28 against
 * `eroge-price.com` for the user's reported case (the romaji
 * "Saya no Uta" returned zero hits, but the Japanese title
 * `沙耶の唄` returns two — `/games/3676` and `/games/33072`).
 *
 * All three artefacts live under `tests/fixtures/eroge-price/` so
 * re-running them is offline and deterministic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseErogePriceMeta,
  parseErogePriceSearch,
  buildErogePriceSearchUrl,
  buildErogePriceGameUrl,
} from '../src/lib/erogeprice-meta';

const FIXTURE = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures/eroge-price', name), 'utf8');

describe('parseErogePriceSearch', () => {
  it('returns both Saya-no-Uta candidates with brand', () => {
    const candidates = parseErogePriceSearch(FIXTURE('search-saya.html'));
    expect(candidates).toEqual([
      { egsId: 33072, title: '沙耶の唄', brand: 'NitroPlus' },
      { egsId: 3676, title: '沙耶の唄', brand: 'NitroPlus' },
    ]);
  });

  it('returns an empty array for a non-search page', () => {
    expect(parseErogePriceSearch('<html>nope</html>')).toEqual([]);
  });
});

describe('parseErogePriceMeta — /games/3676 (Saya no Uta original 2003 release)', () => {
  const meta = parseErogePriceMeta(FIXTURE('game-3676-saya.html'), 'https://eroge-price.com/games/3676', 3676);

  it('hydrates the top-of-page identity block', () => {
    expect(meta).not.toBeNull();
    expect(meta!.egsId).toBe(3676);
    expect(meta!.title).toBe('沙耶の唄');
    expect(meta!.brand).toBe('NitroPlus');
    expect(meta!.releaseDate).toBe('2003-12-26');
    expect(meta!.ageRating).toBe('R18');
    expect(meta!.imageUrl).toBe('https://pics.dmm.co.jp/digital/pcgame/hobc_0527/hobc_0527pl.jpg');
    expect(meta!.editionsAvailable.sort()).toEqual(['ダウンロード版', 'パッケージ版']);
  });

  it('reads the current low / high / offerCount from AggregateOffer', () => {
    expect(meta!.currentLow).toBe(2530);
    expect(meta!.currentHigh).toBe(3211);
    expect(meta!.offerCount).toBe(3);
  });

  it('parses the price-history summary block', () => {
    expect(meta!.history.sampleCount).toBe(217);
    expect(meta!.history.allTimeLow).toEqual({ price: 1501, date: '2026-05-22' });
    expect(meta!.history.allTimeHigh).toEqual({ price: 3411, date: '2026-05-25' });
    expect(meta!.history.updatedAt).toBe('2026-05-27');
  });

  it('parses the full staff block including 声優', () => {
    expect(meta!.staff.scenario).toEqual(['虚淵玄']);
    expect(meta!.staff.artist).toEqual(['中央東口']);
    expect(meta!.staff.music).toEqual(['磯江俊道', '川越好博', '神保伸太郎', '大山曜']);
    expect(meta!.staff.themeSong).toEqual(['いとうかなこ']);
    expect(meta!.staff.voiceActors).toEqual([
      '矢沢泉',
      '川村みどり',
      '海原エレナ',
      '佐藤まこと',
      '氷河流',
      '片岡大二郎',
      '鬼沢雅維',
    ]);
  });

  it('parses the comparison table — three rows, each with shop / edition / price / condition', () => {
    expect(meta!.offers).toEqual([
      { shop: '駿河屋', edition: 'パッケージ版', price: 3211, condition: '特殊版・限定版 / 中古', saleLabel: null },
      { shop: 'DLsite', edition: 'ダウンロード版', price: 2530, condition: '通常', saleLabel: null },
      { shop: 'FANZA', edition: 'ダウンロード版', price: 2530, condition: '通常', saleLabel: null },
    ]);
  });

  it('walks the three related-games sections', () => {
    const sameStaff = meta!.related.filter((r) => r.kind === 'same-staff');
    expect(sameStaff.length).toBeGreaterThan(0);
    // The same-staff list specifically renders `（Brand）` after each link.
    expect(sameStaff[0].brand).toBeTruthy();
    expect(sameStaff.some((r) => r.egsId === 33072 && r.title === '沙耶の唄')).toBe(true);
    expect(meta!.related.some((r) => r.kind === 'brand-other')).toBe(true);
    expect(meta!.related.some((r) => r.kind === 'same-year')).toBe(true);
  });
});

describe('parseErogePriceMeta — /games/33072 (Saya no Uta 2015 re-release)', () => {
  const meta = parseErogePriceMeta(FIXTURE('game-33072-saya.html'), 'https://eroge-price.com/games/33072', 33072);

  it('hydrates the identity block for the re-release', () => {
    expect(meta!.title).toBe('沙耶の唄');
    expect(meta!.brand).toBe('NitroPlus');
    expect(meta!.releaseDate).toBe('2015-11-27');
    expect(meta!.ageRating).toBe('R18');
  });

  it('keeps the らしんばん row (multiline condition cell)', () => {
    const rashinban = meta!.offers.find((r) => r.shop === 'らしんばん');
    expect(rashinban).toBeTruthy();
    expect(rashinban!.edition).toBe('パッケージ版');
    expect(rashinban!.price).toBe(3390);
    expect(rashinban!.condition).toContain('店舗併売品');
  });
});

describe('build helpers', () => {
  it('search URL encodes the Japanese query', () => {
    expect(buildErogePriceSearchUrl('沙耶の唄')).toBe(
      'https://eroge-price.com/games?q=%E6%B2%99%E8%80%B6%E3%81%AE%E5%94%84',
    );
  });

  it('game URL is /games/{egsId}', () => {
    expect(buildErogePriceGameUrl(3676)).toBe('https://eroge-price.com/games/3676');
  });
});
