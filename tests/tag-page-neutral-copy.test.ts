/**
 * R5-214 pin: tag-detail copy stays neutral.
 *
 * The operator's note: "Do not label every VNDB tag result as
 * 'Best VNs with this tag'". The dictionary keys for FR/EN/JA must
 * use neutral phrasing — `topVns` is `"VNs with this tag"` /
 * `"VN avec ce tag"` / `"このタグの VN"`, not anything that implies
 * a quality ranking, unless the page actually sorts by rating.
 */
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';

const FORBIDDEN_QUALITY_TOKENS = [
  // EN
  /\bBest VN/i,
  /\bTop[- ]?ranked/i,
  /\bHighest[- ]?rated/i,
  // FR
  /\bMeilleurs? VN/i,
  /\bClassement\b/i,
  // JA
  /最高の/,
  /人気の/,
];

describe('tag-page copy stays neutral (R5-214)', () => {
  const LOCALES = ['fr', 'en', 'ja'] as const;
  for (const loc of LOCALES) {
    const tagPage = dictionaries[loc].tagPage;
    it(`[${loc}] topVns label is neutral, not "Best VN"`, () => {
      for (const re of FORBIDDEN_QUALITY_TOKENS) {
        expect(tagPage.topVns, `[${loc}] topVns="${tagPage.topVns}"`).not.toMatch(re);
      }
    });

    it(`[${loc}] vndbCount label is neutral`, () => {
      for (const re of FORBIDDEN_QUALITY_TOKENS) {
        expect(tagPage.vndbCount, `[${loc}] vndbCount="${tagPage.vndbCount}"`).not.toMatch(re);
      }
    });

    it(`[${loc}] localMatches label is neutral`, () => {
      for (const re of FORBIDDEN_QUALITY_TOKENS) {
        expect(tagPage.localMatches, `[${loc}] localMatches="${tagPage.localMatches}"`).not.toMatch(re);
      }
    });
  }
});
