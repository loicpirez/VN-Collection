import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const vndb = readFileSync('src/lib/vndb.ts', 'utf8');
const page = readFileSync('src/app/trait/[id]/page.tsx', 'utf8');
const dictionaries = readFileSync('src/lib/i18n/dictionaries.ts', 'utf8');

describe('trait detail pagination', () => {
  it('passes VNDB page state through the global trait query', () => {
    expect(vndb).toContain('export async function getCharactersForTraitPage(');
    expect(vndb).toContain('page: Math.max(1, Math.floor(page))');
    expect(page).toContain('getCharactersForTraitPage(id, { results: TRAIT_CHARACTER_PAGE_SIZE, page })');
    expect(page).toContain('hasMore = response.more');
  });

  it('fetches the complete collection-only trait scope in bounded VN chunks', () => {
    expect(vndb).toContain('export async function getCharactersForTraitInVns(');
    expect(vndb).toContain('offset += 90');
    expect(vndb).toContain("filters: ['and', traitFilter, ['vn', '=', vnFilter]]");
    expect(vndb).toContain('if (!response.more) break');
    expect(page).toContain('const mine = await getCharactersForTraitInVns(id, Array.from(ownedVnIds))');
  });

  it('renders localized server pagination controls', () => {
    expect(page).toContain('aria-label={t.traits.paginationLabel}');
    expect(page).toContain('href={pageHref(page - 1, mineOnly)}');
    expect(page).toContain('href={pageHref(page + 1, mineOnly)}');
    expect(dictionaries).toContain("paginationLabel: 'Pagination des personnages associés au trait'");
    expect(dictionaries).toContain("paginationLabel: 'Trait character pagination'");
    expect(dictionaries).toContain("paginationLabel: '特徴キャラのページ送り'");
  });
});
