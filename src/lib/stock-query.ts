import type { CollectionItem } from './types';
import type { StockProviderId } from './stock-provider-constants';

/** Build a bounded, de-duplicated title-search set for one VN. */
export function titleQueries(vn: CollectionItem, extraTerms: string[] = []): string[] {
  const values = [
    vn.title,
    vn.alttitle,
    ...extraTerms,
    ...(vn.titles ?? []).flatMap((title) => [title.title, title.latin]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const query = value?.trim();
    if (!query || query.length < 2) continue;
    const key = query.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= 5) break;
  }
  return out;
}

function hasJapanese(value: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value);
}

/** Apply provider-specific title-query limits and language preferences. */
export function titleQueriesForProvider(
  vn: CollectionItem,
  provider: StockProviderId,
  extraTerms: string[] = [],
): string[] {
  const queries = titleQueries(vn, extraTerms);
  if (provider !== 'amazon_jp') return queries;
  const japanese = queries.filter(hasJapanese);
  return (japanese.length > 0 ? japanese : queries).slice(0, 3);
}

/** Build Amazon JP's bounded high-recall and qualified search variants. */
export function amazonSearchTerms(query: string): string[] {
  return [...new Set([query, `${query} PCゲーム`])];
}
