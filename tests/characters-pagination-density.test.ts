import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_SOURCE = readFileSync(join(process.cwd(), 'src/app/characters/page.tsx'), 'utf8');
const DICT_SOURCE = readFileSync(join(process.cwd(), 'src/lib/i18n/dictionaries.ts'), 'utf8');

describe('characters page pagination and density', () => {
  it('paginates long character result sets before grouping and rendering cards', () => {
    expect(PAGE_SOURCE).toContain('const PAGE_SIZE = 60');
    expect(PAGE_SOURCE).toContain('const paged = sorted.slice(pageStart, pageStart + PAGE_SIZE)');
    expect(PAGE_SOURCE).toContain('const groups = groupCharacters(paged, params.groupBy)');
  });

  it('uses the characterWorks density scope for character appearance cards', () => {
    expect(PAGE_SOURCE).toContain('<DensityScopeProvider scope="characterWorks"');
    expect(PAGE_SOURCE).toContain('<CardDensitySlider scope="characterWorks"');
    expect(PAGE_SOURCE).toContain('var(--card-density-px, 180px)');
  });

  it('localizes pagination controls in all dictionaries', () => {
    expect(DICT_SOURCE).toContain("paginationLabel: 'Pagination des personnages'");
    expect(DICT_SOURCE).toContain("paginationLabel: 'Characters pagination'");
    expect(DICT_SOURCE).toContain("paginationLabel: 'キャラクターのページ移動'");
  });
});
