import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'src/app/brand-overlap/page.tsx'), 'utf8');
const dict = readFileSync(join(__dirname, '..', 'src/lib/i18n/dictionaries.ts'), 'utf8');

describe('brand overlap long-result pagination', () => {
  it('windows the rendered collaborator list instead of mapping every entry', () => {
    expect(source).toContain('const BRAND_OVERLAP_PAGE_SIZE = 20');
    expect(source).toContain('const pagedEntries = result.entries.slice');
    expect(source).toContain('pagedEntries.map((e)');
    expect(source).not.toContain('result.entries.map((e)');
  });

  it('preserves selected brands while moving between pages', () => {
    expect(source).toContain('function brandOverlapHref');
    expect(source).toContain("new URLSearchParams({ a, b })");
    expect(source).toContain("sp.set('p', String(page))");
  });

  it('has localized pagination labels in every dictionary', () => {
    expect(dict).toContain("paginationLabel: 'Pagination du croisement'");
    expect(dict).toContain("paginationLabel: 'Brand overlap pagination'");
    expect(dict).toContain("paginationLabel: 'スタジオ横断のページ送り'");
    expect(dict).toContain("pageLabel: 'Page {current} / {total}'");
    expect(dict).toContain("pageLabel: '{current} / {total} ページ'");
  });
});
